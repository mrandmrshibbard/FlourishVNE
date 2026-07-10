# VNScreenView — renders a custom UI screen (title / menu / pause) from the bundle's ui.screens: a
# background + positioned Image/Text/Button elements. Buttons are focusable (controller D-pad + accept)
# and emit `action(a)` on press for VNPlayer to dispatch. Positions are % of the screen; anchorX/anchorY
# (0..1) is the element's own pivot at that point.
class_name VNScreenView
extends Control

signal action(a: Dictionary)


const BACKDROP_BLUR_SHADER := "shader_type canvas_item;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float amount = 2.0;
void fragment() {
	vec2 ps = amount / vec2(textureSize(screen_tex, 0));
	vec4 sum = vec4(0.0);
	for (int x = -2; x <= 2; x++) {
		for (int y = -2; y <= 2; y++) {
			sum += texture(screen_tex, SCREEN_UV + vec2(float(x), float(y)) * ps);
		}
	}
	COLOR = vec4(mix(sum.rgb / 25.0, vec3(0.0), COLOR.a), 1.0);
}"

const TEXT_GRADIENT_SHADER := "shader_type canvas_item;
uniform vec4 c0 : source_color; uniform vec4 c1 : source_color; uniform vec2 dir = vec2(0.0,1.0);
void fragment() {
	float t = clamp(dot(UV, normalize(dir)) * 0.5 + 0.5, 0.0, 1.0);
	vec4 tex = texture(TEXTURE, UV);
	COLOR = vec4(mix(c0.rgb, c1.rgb, t), tex.a * COLOR.a);
}"
var _settings := {}
var _state: VNGameState = null   # for element visibility conditions + variable-bound widgets
var _loader: BundleLoader = null  # for the character-creator compositing helpers
var _parallax_nodes: Array = []   # elements with parallaxDepth, nudged by the mouse in _process
var _revealed: Dictionary = {}    # ids of startHidden elements a ShowElement action has revealed
# drag-drop puzzle state
var _hotspots: Array = []          # drop targets: {node, acceptTag, acceptedIds, actions, snap}
var _dragging: Control = null      # element currently being dragged
var _drag_offset := Vector2.ZERO
var _drag_origin := Vector2.ZERO
var _drag_el: Dictionary = {}
var _placed := {}                  # ids of draggables that have been dropped on a valid hotspot
var _draggable_ids: Array = []     # all draggable element ids (for the allPlaced win check)
var _draggable_nodes := {}         # id -> draggable node
var _win_condition: Dictionary = {}
var _won := false

func build(screen: Dictionary, loader: BundleLoader, settings: Dictionary = {}, state: VNGameState = null, revealed: Dictionary = {}) -> void:
	_settings = settings
	_state = state
	_loader = loader
	_revealed = revealed
	_parallax_nodes.clear()
	_hotspots.clear()
	_placed.clear()
	_draggable_ids.clear()
	_draggable_nodes.clear()
	_dragging = null
	_won = false
	_win_condition = screen.get("winCondition", {})
	for c in get_children():
		c.queue_free()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	# Overlay/HUD screens sit OVER the running story (transparent + optional dim/blur backdrop); normal
	# menu screens draw an opaque base so the story behind is hidden.
	var is_overlay: bool = screen.get("passThrough", false) or screen.get("hudNonBlocking", false) or screen.get("showDialogue", false) or screen.has("backdropOpacity")
	var base := ColorRect.new()
	base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if is_overlay:
		base.color = Color(0, 0, 0, clampf(float(screen.get("backdropOpacity", 0.0)), 0.0, 1.0))
		if float(screen.get("backdropBlur", 0.0)) > 0.0:
			base.material = _backdrop_blur_material(float(screen.get("backdropBlur")))
	else:
		base.color = _to_color(screen.get("backgroundColor"), Color(0.05, 0.05, 0.07))
	add_child(base)

	# main background then any additional stacked background planes
	var bgp = screen.get("background")
	if bgp:
		var tex := loader.load_texture(bgp)
		if tex:
			var tr := TextureRect.new()
			tr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
			tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
			tr.texture = tex
			add_child(tr)
	for ab in screen.get("additionalBackgrounds", []):
		if ab is Dictionary:
			var at := loader.load_texture(ab.get("image"))
			if at != null:
				var atr := TextureRect.new()
				atr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
				atr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
				atr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
				atr.mouse_filter = Control.MOUSE_FILTER_IGNORE
				atr.texture = at
				add_child(atr)
				if ab.has("parallaxDepth") and float(ab.get("parallaxDepth")) != 0.0:
					_parallax_nodes.append({ "node": atr, "base": Vector2.ZERO, "depth": float(ab.get("parallaxDepth")) })

	var sz := get_viewport_rect().size
	var first_btn: Control = null
	for el in screen.get("elements", []):
		# Visibility gating: startHidden elements stay hidden until a ShowElement action reveals them
		# (tracked in _revealed by id); conditional elements appear only when their conditions pass.
		if el.get("startHidden", false) and not _revealed.get(str(el.get("id", "")), false):
			continue
		if el.has("if") and _state != null and not _state.eval_conditions(el.get("if")):
			continue
		var node := _build_element(el, loader)
		if node == null:
			continue
		add_child(node)
		_place(node, el, sz)
		_apply_base_features(node, el)
		if node is Button and first_btn == null:
			first_btn = node
	if first_btn:
		first_btn.call_deferred("grab_focus")

# Base-element features shared by every element: appearance states, disabled state, entry transition,
# click/hover sounds, parallax registration.
func _apply_base_features(node: Control, el: Dictionary) -> void:
	# appearance states — first whose conditions pass overrides colour/opacity/scale/rotation
	for st in el.get("appearanceStates", []):
		if st is Dictionary and st.has("if") and _state != null and _state.eval_conditions(st.get("if")):
			if st.has("opacity"): node.modulate.a = clampf(float(st.get("opacity")), 0.0, 1.0)
			if st.has("color"): node.modulate = _to_color(st.get("color"), node.modulate)
			if st.has("scale"): node.scale = Vector2(float(st.get("scale")), float(st.get("scale")))
			if st.has("rotation"): node.rotation_degrees = float(st.get("rotation"))
			if st.get("image") != null and node is TextureRect:
				var t := _loader.load_texture(st.get("image"))
				if t != null: (node as TextureRect).texture = t
			break
	# disabled state — grey out + block input when its conditions pass
	if el.has("disabledIf") and _state != null and _state.eval_conditions(el.get("disabledIf")):
		node.modulate = node.modulate * Color(0.6, 0.6, 0.6, 1.0)
		if node is Button: (node as Button).disabled = true
		else: node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# click / hover sounds
	if node is Button:
		var b := node as Button
		if el.get("clickSound") != null:
			var cs = el.get("clickSound")
			b.pressed.connect(func() -> void: emit_signal("action", { "action": "playSound", "audio": cs }))
		if el.get("hoverSound") != null:
			var hs = el.get("hoverSound")
			b.mouse_entered.connect(func() -> void: emit_signal("action", { "action": "playSound", "audio": hs }))
	# parallax (mouse) — registered for _process to nudge
	if el.has("parallaxDepth") and float(el.get("parallaxDepth")) != 0.0:
		_parallax_nodes.append({ "node": node, "base": node.position, "depth": float(el.get("parallaxDepth")) })
	# drag-drop: a draggable element the player can pick up (started here, tracked in _input)
	if el.get("draggable", false):
		_draggable_ids.append(str(el.get("id", "")))
		_draggable_nodes[str(el.get("id", ""))] = node
		node.mouse_filter = Control.MOUSE_FILTER_STOP
		var el_copy := el
		node.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT and _dragging == null:
				_dragging = node
				_drag_el = el_copy
				_drag_origin = node.position
				_drag_offset = node.get_global_mouse_position() - node.global_position
				node.move_to_front())
	# entry transition
	_entry_transition(node, el)

# Animate an element in on screen open (fade / slide / scale), honoring transitionInMs + delay.
func _entry_transition(node: Control, el: Dictionary) -> void:
	var t := str(el.get("transitionIn", ""))
	if t == "" or t == "none":
		return
	var dur := float(el.get("transitionInMs", 300)) / 1000.0
	var delay := float(el.get("transitionDelayMs", 0)) / 1000.0
	var final_pos := node.position
	var final_a := node.modulate.a
	var vp := get_viewport_rect().size
	var tw := create_tween().set_parallel(true)
	if delay > 0.0:
		tw.tween_interval(delay)
	match t:
		"fade":
			node.modulate.a = 0.0
			tw.tween_property(node, "modulate:a", final_a, dur).set_delay(delay)
		"scale":
			node.scale = Vector2(0.6, 0.6)
			node.modulate.a = 0.0
			tw.tween_property(node, "scale", Vector2.ONE, dur).set_delay(delay)
			tw.tween_property(node, "modulate:a", final_a, dur).set_delay(delay)
		"slideUp", "slideDown", "slideLeft", "slideRight":
			var off := Vector2.ZERO
			match t:
				"slideUp": off = Vector2(0, vp.y * 0.15)
				"slideDown": off = Vector2(0, -vp.y * 0.15)
				"slideLeft": off = Vector2(vp.x * 0.15, 0)
				"slideRight": off = Vector2(-vp.x * 0.15, 0)
			node.position = final_pos + off
			node.modulate.a = 0.0
			tw.tween_property(node, "position", final_pos, dur).set_delay(delay)
			tw.tween_property(node, "modulate:a", final_a, dur).set_delay(delay)

func _process(_delta: float) -> void:
	if _parallax_nodes.is_empty() or not visible:
		return
	var vp := get_viewport_rect().size
	var m := get_viewport().get_mouse_position()
	var off := (m - vp * 0.5)
	for p in _parallax_nodes:
		var n: Control = p["node"]
		if is_instance_valid(n):
			n.position = p["base"] - off * (p["depth"] * 0.05)

func _place(node: Control, el: Dictionary, sz: Vector2) -> void:
	var w := float(el.get("w", 20)) / 100.0 * sz.x
	var h := float(el.get("h", 8)) / 100.0 * sz.y
	var ax := float(el.get("anchorX", 0))
	var ay := float(el.get("anchorY", 0))
	var px := float(el.get("x", 0)) / 100.0 * sz.x
	var py := float(el.get("y", 0)) / 100.0 * sz.y
	node.set_anchors_preset(Control.PRESET_TOP_LEFT)
	node.position = Vector2(px - ax * w, py - ay * h)
	node.size = Vector2(w, h)
	node.custom_minimum_size = Vector2(w, h)
	if el.has("opacity"):
		node.modulate.a = clampf(float(el.get("opacity")), 0.0, 1.0)

func _flat_box(color: Color, radius: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.corner_radius_top_left = radius
	sb.corner_radius_top_right = radius
	sb.corner_radius_bottom_left = radius
	sb.corner_radius_bottom_right = radius
	return sb

func _halign(a) -> int:
	match str(a):
		"left": return HORIZONTAL_ALIGNMENT_LEFT
		"right": return HORIZONTAL_ALIGNMENT_RIGHT
		_: return HORIZONTAL_ALIGNMENT_CENTER

func _valign(a) -> int:
	match str(a):
		"top": return VERTICAL_ALIGNMENT_TOP
		"bottom": return VERTICAL_ALIGNMENT_BOTTOM
		_: return VERTICAL_ALIGNMENT_CENTER

func _build_element(el: Dictionary, loader: BundleLoader) -> Control:
	match el.get("type"):
		"image":
			var tex := loader.load_texture(el.get("image"))
			if tex == null and el.has("backgroundColor"):
				var cr := ColorRect.new()
				cr.color = _to_color(el.get("backgroundColor"), Color.WHITE)
				cr.mouse_filter = Control.MOUSE_FILTER_IGNORE
				return cr
			var tr := TextureRect.new()
			tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
			tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			var fit := str(el.get("objectFit", "contain"))
			tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED if fit == "cover" else (TextureRect.STRETCH_SCALE if fit == "fill" else TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
			tr.texture = tex
			return tr
		"text":
			var lbl := Label.new()
			lbl.text = str(el.get("text", ""))
			lbl.horizontal_alignment = _halign(el.get("align", "center"))
			lbl.vertical_alignment = _valign(el.get("valign", "center"))
			# An autowrap Label inflates its minimum height (Godot computes it at a tiny width), which
			# clamps our set size taller than the box and pushes vertically-centered text off-position.
			# Clip to the designed box instead.
			lbl.autowrap_mode = TextServer.AUTOWRAP_OFF
			lbl.clip_contents = true
			lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
			_apply_font(lbl, el, loader)
			if el.get("textGradient") != null:
				_apply_text_gradient(lbl, el.get("textGradient"))
			return lbl
		"button":
			var b := Button.new()
			b.text = str(el.get("text", ""))
			b.clip_text = true
			b.alignment = _halign(el.get("align", "center"))
			var img = el.get("image")
			if img:
				var tex := loader.load_texture(img)
				if tex:
					var sb := StyleBoxTexture.new()
					sb.texture = tex
					b.add_theme_stylebox_override("normal", sb)
					var hover_tex: Texture2D = loader.load_texture(el.get("hoverImage")) if el.has("hoverImage") else null
					var sbh := StyleBoxTexture.new()
					sbh.texture = hover_tex if hover_tex != null else tex
					b.add_theme_stylebox_override("hover", sbh)
					b.add_theme_stylebox_override("focus", sbh)
					b.add_theme_stylebox_override("pressed", sbh)
			elif el.has("backgroundColor") or el.has("borderRadius"):
				var br := int(el.get("borderRadius", 4))
				b.add_theme_stylebox_override("normal", _flat_box(_to_color(el.get("backgroundColor", "#333333"), Color(0.2, 0.2, 0.2)), br))
				var hc := _to_color(el.get("hoverBackgroundColor", el.get("backgroundColor", "#444444")), Color(0.3, 0.3, 0.3))
				b.add_theme_stylebox_override("hover", _flat_box(hc, br))
				b.add_theme_stylebox_override("focus", _flat_box(hc, br))
			_apply_font(b, el, loader)
			var acts: Array = el.get("actions", [])
			if acts.is_empty() and el.has("action"):
				acts = [el.get("action")]
			b.pressed.connect(func() -> void:
				for a in acts: emit_signal("action", a))
			return b
		"saveSlotGrid":
			return _build_save_grid(el)
		"settingsSlider":
			var sl := HSlider.new()
			sl.min_value = 0.0
			sl.max_value = 1.0
			sl.step = 0.01
			var setting := str(el.get("setting", ""))
			sl.value = float(_settings.get(setting, 0.8))
			if el.get("trackImage") != null:
				var tt := _loader.load_texture(el.get("trackImage"))
				if tt != null:
					var tsb := StyleBoxTexture.new()
					tsb.texture = tt
					sl.add_theme_stylebox_override("slider", tsb)
			elif el.get("trackColor") != null:
				sl.add_theme_stylebox_override("slider", _flat_box(_to_color(el.get("trackColor"), Color(0.3, 0.3, 0.3)), 4))
			if el.get("thumbImage") != null:
				var th := _loader.load_texture(el.get("thumbImage"))
				if th != null: sl.add_theme_icon_override("grabber", th); sl.add_theme_icon_override("grabber_highlight", th)
			sl.value_changed.connect(func(v: float) -> void: emit_signal("action", { "action": "setSetting", "setting": setting, "value": v }))
			return sl
		"settingsToggle":
			var cb := CheckButton.new()
			cb.text = str(el.get("text", ""))
			var tsetting := str(el.get("setting", ""))
			cb.button_pressed = bool(_settings.get(tsetting, false))
			if el.get("checkedImage") != null:
				var ci := _loader.load_texture(el.get("checkedImage"))
				if ci != null: cb.add_theme_icon_override("checked", ci)
			if el.get("uncheckedImage") != null:
				var ui := _loader.load_texture(el.get("uncheckedImage"))
				if ui != null: cb.add_theme_icon_override("unchecked", ui)
			cb.toggled.connect(func(on: bool) -> void: emit_signal("action", { "action": "setSetting", "setting": tsetting, "value": on }))
			_apply_font(cb, el, loader)
			return cb
		"checkbox":
			var box := CheckBox.new()
			box.text = str(el.get("label", ""))
			var cvar = el.get("var")
			var cval = el.get("checkedValue", true)
			var uval = el.get("uncheckedValue", false)
			box.button_pressed = _state != null and _state.vars.has(cvar) and _var_eq(_state.vars.get(cvar), cval)
			if el.has("labelColor"):
				box.add_theme_color_override("font_color", _to_color(el.get("labelColor"), Color.WHITE))
			box.toggled.connect(func(on: bool) -> void:
				emit_signal("action", { "action": "setVar", "var": cvar, "op": "set", "value": (cval if on else uval), "refresh": true }))
			_apply_font(box, el, loader)
			return box
		"textInput":
			var le := LineEdit.new()
			le.placeholder_text = str(el.get("placeholder", ""))
			var tvar = el.get("var")
			if _state != null and _state.vars.has(tvar):
				le.text = str(_state.vars.get(tvar))
			if el.has("maxLength"):
				le.max_length = int(el.get("maxLength"))
			if el.has("backgroundColor") or el.has("borderColor"):
				var sb := _flat_box(_to_color(el.get("backgroundColor", "#ffffff"), Color.WHITE), 4)
				if el.has("borderColor"):
					sb.border_color = _to_color(el.get("borderColor"), Color.GRAY)
					sb.set_border_width_all(2)
				le.add_theme_stylebox_override("normal", sb)
			# Commit on submit or when focus leaves — never mid-keystroke (avoids rebuilding while typing).
			le.text_submitted.connect(func(t: String) -> void: emit_signal("action", { "action": "setVar", "var": tvar, "op": "set", "value": t }))
			le.focus_exited.connect(func() -> void: emit_signal("action", { "action": "setVar", "var": tvar, "op": "set", "value": le.text }))
			_apply_font(le, el, loader)
			return le
		"dropdown":
			var ob := OptionButton.new()
			ob.clip_text = true
			var dvar = el.get("var")
			var opts: Array = el.get("options", [])
			var cur = _state.vars.get(dvar) if (_state != null and _state.vars.has(dvar)) else null
			var sel := -1
			for i in opts.size():
				ob.add_item(str(opts[i].get("label", "")), i)
				if cur != null and _var_eq(cur, opts[i].get("value")):
					sel = i
			if sel >= 0:
				ob.select(sel)
			ob.item_selected.connect(func(i: int) -> void:
				emit_signal("action", { "action": "setVar", "var": dvar, "op": "set", "value": opts[i].get("value"), "refresh": true }))
			_apply_font(ob, el, loader)
			return ob
		"meter":
			return _build_meter(el, loader)
		"hotSpot":
			return _build_hotspot(el)
		"characterPreview":
			return _build_character_preview(el, loader)
		"assetCycler":
			return _build_asset_cycler(el, loader)
		"customizer":
			return _build_customizer(el, loader)
	return null

# A stat/health meter bound to a variable. Renders bar / segments / icons; battery falls back to bar.
# Children use anchors so they re-lay-out when _place() sets the meter's final size.
func _build_meter(el: Dictionary, loader: BundleLoader) -> Control:
	var root := Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mn := float(el.get("min", 0))
	var mx := float(el.get("max", 100))
	var val := _var_num(el.get("var"), mn)
	var ratio := 0.0 if mx == mn else clampf((val - mn) / (mx - mn), 0.0, 1.0)
	var style := str(el.get("style", "bar"))
	var fill_col := _to_color(el.get("fillColor", "#4caf50"), Color(0.3, 0.7, 0.3))

	if style == "icons":
		var count := int(el.get("iconCount", 5))
		var full := loader.load_texture(el.get("iconImage"))
		var empty := loader.load_texture(el.get("iconEmptyImage"))
		var hb := HBoxContainer.new()
		hb.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		hb.add_theme_constant_override("separation", int(el.get("iconGap", 4)))
		hb.alignment = BoxContainer.ALIGNMENT_BEGIN
		var filled := int(round(ratio * count))
		for i in count:
			var tr := TextureRect.new()
			tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			tr.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			tr.size_flags_vertical = Control.SIZE_EXPAND_FILL
			var t: Texture2D = full if i < filled else (empty if empty != null else full)
			if i >= filled and empty == null and full != null:
				tr.modulate = Color(1, 1, 1, 0.25)  # no empty art → dim the full icon
			tr.texture = t
			hb.add_child(tr)
		root.add_child(hb)
		return root

	# bg panel (color / border / radius), shared by bar + segments
	var br := int(el.get("borderRadius", 3))
	var bg := Panel.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bgsb := _flat_box(_to_color(el.get("backgroundColor", "#00000066"), Color(0, 0, 0, 0.4)), br)
	if el.has("borderColor"):
		bgsb.border_color = _to_color(el.get("borderColor"), Color.WHITE)
		bgsb.set_border_width_all(2)
	bg.add_theme_stylebox_override("panel", bgsb)
	root.add_child(bg)

	if style == "segments":
		var seg := int(el.get("segmentCount", 10))
		var lit := int(round(ratio * seg))
		var hb2 := HBoxContainer.new()
		hb2.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		hb2.add_theme_constant_override("separation", int(el.get("segmentGap", 2)))
		for i in seg:
			var cell := ColorRect.new()
			cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			cell.size_flags_vertical = Control.SIZE_EXPAND_FILL
			cell.color = fill_col if i < lit else Color(1, 1, 1, 0.08)
			hb2.add_child(cell)
		root.add_child(hb2)
	else:
		# bar (also the battery fallback): a fill rect anchored per direction so it scales with the meter
		var fill := ColorRect.new()
		fill.color = fill_col
		fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var dir := str(el.get("direction", "ltr"))
		match dir:
			"rtl": fill.set_anchor(SIDE_LEFT, 1.0 - ratio); fill.set_anchor(SIDE_RIGHT, 1.0); fill.set_anchor(SIDE_TOP, 0.0); fill.set_anchor(SIDE_BOTTOM, 1.0)
			"up": fill.set_anchor(SIDE_LEFT, 0.0); fill.set_anchor(SIDE_RIGHT, 1.0); fill.set_anchor(SIDE_TOP, 1.0 - ratio); fill.set_anchor(SIDE_BOTTOM, 1.0)
			_: fill.set_anchor(SIDE_LEFT, 0.0); fill.set_anchor(SIDE_RIGHT, ratio); fill.set_anchor(SIDE_TOP, 0.0); fill.set_anchor(SIDE_BOTTOM, 1.0)
		fill.offset_left = 0; fill.offset_top = 0; fill.offset_right = 0; fill.offset_bottom = 0
		root.add_child(fill)

	# optional label / numeric readout centered over the meter
	if el.get("showLabel", false) or el.get("showValue", false):
		var parts: Array[String] = []
		if el.get("showLabel", false) and str(el.get("label", "")) != "":
			parts.append(str(el.get("label")))
		if el.get("showValue", false):
			parts.append(_meter_value_text(str(el.get("valueFormat", "value")), val, mx))
		var lbl := Label.new()
		lbl.text = " ".join(parts)
		lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		lbl.horizontal_alignment = _halign(el.get("alignX", "center"))
		lbl.vertical_alignment = _valign(el.get("alignY", "center"))
		lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_apply_font(lbl, el, loader)
		root.add_child(lbl)
	return root

func _meter_value_text(fmt: String, val: float, mx: float) -> String:
	match fmt:
		"valueMax": return "%s/%s" % [_num_str(val), _num_str(mx)]
		"percent": return "%d%%" % int(round((val / mx) * 100.0)) if mx != 0 else "0%"
		_: return _num_str(val)

func _num_str(v: float) -> String:
	return str(int(v)) if v == floor(v) else str(v)

func _var_num(id, fallback: float) -> float:
	if _state == null or not _state.vars.has(id): return fallback
	var v = _state.vars.get(id)
	if v is bool: return 1.0 if v else 0.0
	if v is int or v is float: return float(v)
	if v is String and v.is_valid_float(): return v.to_float()
	return fallback

func _var_eq(a, b) -> bool:
	if (a is int or a is float) and (b is int or b is float): return float(a) == float(b)
	if a is bool or b is bool: return bool(a) == bool(b)
	return str(a) == str(b)

func _apply_font(node: Control, el: Dictionary, loader: BundleLoader) -> void:
	var fp = el.get("font")
	if fp:
		var ff := loader.load_font(fp)
		if ff != null:
			node.add_theme_font_override("font", ff)
	if el.has("fontSize"):
		node.add_theme_font_size_override("font_size", int(el.get("fontSize")))
	if el.has("color"):
		node.add_theme_color_override("font_color", _to_color(el.get("color"), Color.WHITE))
	# text outline (textBorder) — what makes titles/buttons pop over busy art
	var tb = el.get("textBorder")
	if tb is Dictionary:
		node.add_theme_color_override("font_outline_color", _to_color(tb.get("color", "#000000"), Color.BLACK))
		node.add_theme_constant_override("outline_size", int(maxf(1.0, float(tb.get("width", 1)) * 2.0)))
	# drop shadow (textShadow) — Label/RichTextLabel honor these; Button ignores harmlessly
	var ts = el.get("textShadow")
	if ts is Dictionary:
		node.add_theme_color_override("font_shadow_color", _to_color(ts.get("color", "#000000"), Color.BLACK))
		node.add_theme_constant_override("shadow_offset_x", int(ts.get("x", 2)))
		node.add_theme_constant_override("shadow_offset_y", int(ts.get("y", 2)))

func _to_color(s, fallback: Color) -> Color:
	if s is String and s != "" and Color.html_is_valid(s):
		return Color.html(s)
	return fallback

func _backdrop_blur_material(px: float) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = BACKDROP_BLUR_SHADER
	mat.shader = sh
	mat.set_shader_parameter("amount", clampf(px, 0.5, 8.0))
	return mat

# ── character-creator elements (live-composited sprite that swaps layers by variable) ──

# Stack the character base + one chosen asset per layer (selection: layerId -> assetId) as TextureRects.
func _composite_character(char: Dictionary, selection: Dictionary) -> Control:
	var box := Control.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.clip_contents = true
	if char.get("base") != null:
		box.add_child(_char_layer_rect(char.get("base")))
	for L in char.get("layers", []):
		var aid = selection.get(str(L.get("id")))
		if aid == null or str(aid) == "":
			continue
		for a in L.get("assets", []):
			if str(a.get("id")) == str(aid):
				box.add_child(_char_layer_rect(a.get("image")))
				break
	return box

func _char_layer_rect(path) -> TextureRect:
	var tr := TextureRect.new()
	tr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tr.texture = _loader.load_texture(path)
	return tr

# Preview layer selection: expression defaults, then per-layer variable overrides.
func _preview_selection(char: Dictionary, expression_id, layer_vars: Dictionary) -> Dictionary:
	var sel := {}
	var exprs: Array = char.get("expressions", [])
	var chosen := {}
	for e in exprs:
		if str(e.get("id")) == str(expression_id):
			chosen = e
			break
	if chosen.is_empty() and not exprs.is_empty():
		chosen = exprs[0]
	for lid in chosen.get("config", {}):
		sel[lid] = chosen["config"][lid]
	for lid in layer_vars:
		var vid = layer_vars[lid]
		if _state != null and _state.vars.has(vid):
			var v = _state.vars.get(vid)
			if v != null and str(v) != "":
				sel[str(lid)] = v
	return sel

func _build_character_preview(el: Dictionary, ld: BundleLoader) -> Control:
	var char: Dictionary = ld.characters.get(el.get("character"), {})
	if char.is_empty():
		return null
	return _composite_character(char, _preview_selection(char, el.get("expression"), el.get("layerVars", {})))

func _asset_name(char: Dictionary, layer_id: String, asset_id) -> String:
	for L in char.get("layers", []):
		if str(L.get("id")) == layer_id:
			for a in L.get("assets", []):
				if str(a.get("id")) == str(asset_id):
					return str(a.get("name", ""))
	return ""

func _cycle_var(var_id, asset_ids: Array, idx: int, dir: int) -> void:
	if asset_ids.is_empty():
		return
	var ni := (idx + dir + asset_ids.size()) % asset_ids.size()
	emit_signal("action", { "action": "setVar", "var": var_id, "op": "set", "value": asset_ids[ni], "refresh": true })

func _build_asset_cycler(el: Dictionary, ld: BundleLoader) -> Control:
	var char: Dictionary = ld.characters.get(el.get("character"), {})
	var var_id = el.get("var")
	var asset_ids: Array = el.get("assetIds", [])
	var cur = _state.vars.get(var_id) if (_state != null and _state.vars.has(var_id)) else null
	var idx := asset_ids.find(cur)
	if idx < 0: idx = 0
	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	var left := Button.new()
	left.text = "◀"
	left.pressed.connect(func() -> void: _cycle_var(var_id, asset_ids, idx, -1))
	var mid := Label.new()
	mid.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if el.get("showAssetName", false):
		mid.text = _asset_name(char, str(el.get("layer")), asset_ids[idx]) if idx < asset_ids.size() else ""
	else:
		mid.text = str(el.get("label", ""))
	_apply_font(mid, el, ld)
	var right := Button.new()
	right.text = "▶"
	right.pressed.connect(func() -> void: _cycle_var(var_id, asset_ids, idx, 1))
	hb.add_child(left)
	hb.add_child(mid)
	hb.add_child(right)
	return hb

func _layer_asset_ids(char: Dictionary, layer_id: String) -> Array:
	for L in char.get("layers", []):
		if str(L.get("id")) == layer_id:
			var out := []
			for a in L.get("assets", []):
				out.append(a.get("id"))
			return out
	return []

func _customizer_reset(char: Dictionary, cats: Array) -> void:
	for c in cats:
		var assets := _layer_asset_ids(char, str(c.get("layer")))
		if not assets.is_empty():
			emit_signal("action", { "action": "setVar", "var": c.get("var"), "op": "set", "value": assets[0], "refresh": true })

func _customizer_randomize(char: Dictionary, cats: Array) -> void:
	var i := 0
	for c in cats:
		var assets := _layer_asset_ids(char, str(c.get("layer")))
		if not assets.is_empty():
			emit_signal("action", { "action": "setVar", "var": c.get("var"), "op": "set", "value": assets[i % assets.size()], "refresh": true })
		i += 1

func _build_customizer(el: Dictionary, ld: BundleLoader) -> Control:
	var char: Dictionary = ld.characters.get(el.get("character"), {})
	if char.is_empty():
		return null
	var cats: Array = el.get("categories", [])
	var layer_vars := {}
	for c in cats:
		layer_vars[str(c.get("layer"))] = c.get("var")
	var sel := _preview_selection(char, el.get("expression"), layer_vars)
	var preview := _composite_character(char, sel)
	var pickers := VBoxContainer.new()
	pickers.add_theme_constant_override("separation", 8)
	pickers.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for c in cats:
		var var_id = c.get("var")
		var assets: Array = _layer_asset_ids(char, str(c.get("layer")))
		var cur = _state.vars.get(var_id) if (_state != null and _state.vars.has(var_id)) else null
		var idx := assets.find(cur)
		if idx < 0: idx = 0
		var row := HBoxContainer.new()
		if el.get("showLabels", true) and str(c.get("label", "")) != "":
			var lbl := Label.new()
			lbl.text = str(c.get("label"))
			lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			_apply_font(lbl, el, ld)
			row.add_child(lbl)
		var lb := Button.new()
		lb.text = "◀"
		lb.pressed.connect(func() -> void: _cycle_var(var_id, assets, idx, -1))
		var rb := Button.new()
		rb.text = "▶"
		rb.pressed.connect(func() -> void: _cycle_var(var_id, assets, idx, 1))
		row.add_child(lb)
		row.add_child(rb)
		pickers.add_child(row)
	if el.get("showRandomize", false) or el.get("showReset", false):
		var arow := HBoxContainer.new()
		if el.get("showReset", false):
			var rst := Button.new()
			rst.text = str(el.get("resetLabel", "Reset"))
			rst.pressed.connect(func() -> void: _customizer_reset(char, cats))
			arow.add_child(rst)
		if el.get("showRandomize", false):
			var rnd := Button.new()
			rnd.text = str(el.get("randomizeLabel", "Randomize"))
			rnd.pressed.connect(func() -> void: _customizer_randomize(char, cats))
			arow.add_child(rnd)
		pickers.add_child(arow)
	var layout := str(el.get("layout", "preview-left"))
	var container: BoxContainer = VBoxContainer.new() if layout == "preview-top" else HBoxContainer.new()
	var pv_wrap := Control.new()
	pv_wrap.custom_minimum_size = Vector2(120, 120)
	pv_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pv_wrap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	preview.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pv_wrap.add_child(preview)
	if layout == "preview-right":
		container.add_child(pickers)
		container.add_child(pv_wrap)
	else:
		container.add_child(pv_wrap)
		container.add_child(pickers)
	return container

# Save/Load slot grid: styled slots + per-slot erase + hide toggles, scrollable for many slots.
func _build_save_grid(el: Dictionary) -> Control:
	var mode := str(el.get("mode", "load"))
	var count := int(el.get("slotCount", 8))
	var empty_text := str(el.get("emptySlotText", "[ Empty ]"))
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	scroll.add_child(grid)
	for i in count:
		var slot := i + 1
		var info := VNInterpreter.slot_info(slot)
		var row := HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var b := Button.new()
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.clip_text = true
		var lbl := "" if el.get("hideSlotLabel", false) else ("Slot %d — " % slot)
		b.text = lbl + (empty_text if info.is_empty() else str(info.get("sceneName", "Saved")))
		if el.has("slotBackgroundColor") or el.has("slotBorderColor"):
			var sb := _flat_box(_to_color(el.get("slotBackgroundColor", "#222233"), Color(0.13, 0.13, 0.2)), 6)
			if el.has("slotBorderColor"):
				sb.border_color = _to_color(el.get("slotBorderColor"), Color.GRAY)
				sb.set_border_width_all(2)
			b.add_theme_stylebox_override("normal", sb)
		if el.has("slotTextColor"):
			b.add_theme_color_override("font_color", _to_color(el.get("slotTextColor"), Color.WHITE))
		_apply_font(b, el, _loader)
		var s := slot
		var m := mode
		b.pressed.connect(func() -> void: emit_signal("action", { "action": ("saveToSlot" if m == "save" else "loadFromSlot"), "slot": s }))
		row.add_child(b)
		if not el.get("hideEraseButtons", false) and not info.is_empty():
			var eb := Button.new()
			eb.text = "✕"
			eb.custom_minimum_size = Vector2(38, 0)
			eb.pressed.connect(func() -> void: emit_signal("action", { "action": "eraseSlot", "slot": s }))
			row.add_child(eb)
		grid.add_child(row)
	return scroll

# Vertical/angled two-colour gradient over the label text via a canvas_item shader.
func _apply_text_gradient(lbl: Label, g: Dictionary) -> void:
	var cols: Array = g.get("colors", [])
	if cols.size() < 2:
		return
	var c0 := _to_color(cols[0], Color.WHITE)
	var c1 := _to_color(cols[cols.size() - 1], Color.WHITE)
	var ang := deg_to_rad(float(g.get("angle", 90)))
	var mat := ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = TEXT_GRADIENT_SHADER
	mat.shader = sh
	mat.set_shader_parameter("c0", c0)
	mat.set_shader_parameter("c1", c1)
	mat.set_shader_parameter("dir", Vector2(cos(ang), sin(ang)))
	lbl.material = mat

# ── drag-drop puzzle: draggable elements onto matching hotspots ──

# A drop-target region. Registered in _hotspots; drawn only if visible+highlightColor set.
func _build_hotspot(el: Dictionary) -> Control:
	var area := Control.new()
	area.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if el.get("visible", false) and el.has("highlightColor"):
		var box := ColorRect.new()
		box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		box.color = _to_color(el.get("highlightColor"), Color(1, 1, 0, 0.25))
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if str(el.get("shape", "rect")) == "circle":
			box.material = _circle_mask_material()
		area.add_child(box)
	var acts: Array = el.get("actions", [])
	_hotspots.append({
		"node": area, "acceptTag": str(el.get("acceptTag", "")),
		"acceptedIds": el.get("acceptedElementIds", []), "actions": acts,
		"trigger": str(el.get("trigger", "click")),
	})
	return area

# While an element is being dragged, follow the mouse; on release, resolve the drop.
func _input(event: InputEvent) -> void:
	if _dragging == null or not visible:
		return
	if event is InputEventMouseMotion:
		_dragging.global_position = _dragging.get_global_mouse_position() - _drag_offset
	elif event is InputEventMouseButton and not event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_drop()

func _drop() -> void:
	var node := _dragging
	var el := _drag_el
	_dragging = null
	var center := node.global_position + node.size * 0.5
	var target: Dictionary = {}
	for h in _hotspots:
		var hn: Control = h["node"]
		var r := Rect2(hn.global_position, hn.size)
		if not r.has_point(center):
			continue
		# accept if the hotspot takes this element id or its drag tag (empty acceptTag = any)
		var ok := true
		if h["acceptedIds"] is Array and (h["acceptedIds"] as Array).size() > 0:
			ok = (h["acceptedIds"] as Array).has(el.get("id"))
		elif str(h["acceptTag"]) != "":
			ok = str(h["acceptTag"]) == str(el.get("dragTag", ""))
		if ok:
			target = h
			break
	if target.is_empty():
		# no valid target — snap back if configured, else stay put
		if el.get("snapBack", false):
			node.position = _drag_origin
		return
	# valid drop: snap to hotspot centre, hide on drop, fire the hotspot actions, mark placed
	var hn: Control = target["node"]
	if el.get("snapToHotSpot", false):
		node.global_position = hn.global_position + hn.size * 0.5 - node.size * 0.5
	if el.get("hideOnDrop", false):
		node.visible = false
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE  # placed — no longer draggable
	_placed[str(el.get("id", ""))] = true
	for a in target["actions"]:
		emit_signal("action", a)
	_check_win()

# Drag-drop win condition: all draggables placed, or a variable condition met → fire win actions.
func _check_win() -> void:
	if _won or _win_condition.is_empty():
		return
	var met := false
	if str(_win_condition.get("type", "allPlaced")) == "variable":
		if _state != null:
			met = _state.eval_conditions([{ "var": _win_condition.get("var"), "op": _win_condition.get("operator", "=="), "value": _win_condition.get("value") }])
	else:
		met = _draggable_ids.size() > 0 and _placed.size() >= _draggable_ids.size()
	if met:
		_won = true
		for a in _win_condition.get("actions", []):
			emit_signal("action", a)

# A canvas_item shader that clips a rect to a circle (for circular hotspot highlights).
func _circle_mask_material() -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = "shader_type canvas_item; void fragment() { if (length(UV - vec2(0.5)) > 0.5) discard; }"
	mat.shader = sh
	return mat

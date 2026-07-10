# VNPlayer — the visual runtime. Loads a .vnbundle and plays it: background, character sprite, a
# dialogue box (name + text), choice buttons, and text input. Controller-first: choices are focusable
# Buttons (D-pad/stick move focus, A/Enter/click accept); dialogue advances on accept/click.
#
# The UI is built in code (no fragile hand-authored .tscn), so this file is the whole visual layer.
# Which bundle to play: first --  user arg, else the hello-dialogue sample.
extends Control

var loader: BundleLoader
var state: VNGameState
var interp: VNInterpreter

var bg: TextureRect
var bg2: TextureRect       # crossfade overlay for background transitions
var stage: Control        # wraps bg + characters + particles so pan/zoom/shake can transform them
var characters_holder: Control   # holds all on-screen characters (multi-character support)
var _characters := {}            # charId -> Control (each a positioned sprite stack)
var particle_fx: VNParticleFx   # scene particle effects (above the scene, below the dialogue box)
var flash_layer: ColorRect      # transient full-screen flash
var tint_layer: ColorRect       # persistent full-screen tint
var overlay_fx: VNParticleFx    # screen-space weather (rain/snow) — NOT transformed by pan/zoom
var _overlay_rects := {}        # effectType -> ColorRect (fog/haze/smoke/sunbeams/shimmer)
var flashlight_rect: ColorRect  # dark overlay with a soft light hole at the pointer
var _flashlight_on := false
var panel: Panel

# Flashlight: darken everything except a soft circle at the pointer.
const FLASHLIGHT_SHADER := "shader_type canvas_item;
uniform vec2 light_pos = vec2(0.5, 0.5);
uniform float radius = 0.22;
uniform float softness = 0.6;
uniform float darkness = 0.85;
uniform vec4 dark_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform vec2 aspect = vec2(1.777, 1.0);
void fragment() {
	float dist = length((UV - light_pos) * aspect);
	float inner = radius * (1.0 - softness);
	float a = smoothstep(inner, radius, dist);
	COLOR = vec4(dark_color.rgb, a * darkness);
}"

# CRT scanlines: dark horizontal bands over the scene. strength = overall darkness of the bands.
const CRT_SHADER := "shader_type canvas_item;
uniform float strength : hint_range(0.0, 1.0) = 0.3;
void fragment() {
	float s = sin(SCREEN_UV.y * 800.0) * 0.5 + 0.5;
	COLOR = vec4(0.0, 0.0, 0.0, (1.0 - s) * strength);
}"

# Chromatic glitch: resample the screen with the R/B channels offset horizontally (aberration).
const GLITCH_SHADER := "shader_type canvas_item;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform float amount : hint_range(0.0, 0.02) = 0.006;
void fragment() {
	vec2 uv = SCREEN_UV;
	float r = texture(screen_tex, uv + vec2(amount, 0.0)).r;
	float g = texture(screen_tex, uv).g;
	float b = texture(screen_tex, uv - vec2(amount, 0.0)).b;
	COLOR = vec4(r, g, b, 1.0);
}"

var _lights_holder: Node2D = null   # placed twinkling lights (PlaceLights), freed by ClearLights
var _glow_texture: Texture2D = null # cached radial-gradient glow sprite
var _grade_mat: ShaderMaterial = null  # day/night saturation shader on the backgrounds

# Saturation grade for the background (brightness stays on self_modulate, which this reads as COLOR).
const SATURATION_SHADER := "shader_type canvas_item;
uniform float saturation = 1.0;
void fragment() {
	vec4 c = texture(TEXTURE, UV) * COLOR;
	float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
	c.rgb = mix(vec3(g), c.rgb, saturation);
	COLOR = c;
}"
var _overlay_elements := {}          # scene-overlay elements (ShowImage/Text/Button/HotSpot) by command id
var _overlay_layer: Control = null   # holds the scene-overlay elements, above dialogue / below screens
var _credit_overlay: Control = null  # active CreditRoll takeover
var _credit_on_complete := "advance"
var _credit_allow_skip := true
var _movie: VideoStreamPlayer = null  # PlayMovie playback
var _day_hour := 12.0                # current time-of-day hour (0–24) for the day/night grade
var _daynight_tint: ColorRect = null # background colour-grade overlay
var name_label: Label
var text_label: RichTextLabel
var choices_box: VBoxContainer
var text_input: LineEdit
var music: AudioStreamPlayer
var sfx: AudioStreamPlayer
var voice_player: AudioStreamPlayer   # per-line dialogue voice clips
var screen_view: VNScreenView   # custom UI screens (title/menu/pause), drawn on top
var hud_view: VNScreenView      # persistent in-game HUD (gameHudScreen)

var _screen_stack: Array = []
var _current_screen := ""
var _current_passthrough := false  # current screen is a non-blocking HUD (story still gets input)
var _panel_was_visible := false    # dialogue-box visibility to restore when a screen closes
var _hud_active := false            # a gameHudScreen HUD is being shown during gameplay
var _shown_elements := {}           # ids of startHidden screen elements revealed by ShowElement
var _screen_overlays: Array = []   # effectType strings the current screen added (cleared on close)
var _choice_style := {}   # In-Game UI choiceMenu styling, applied to choice buttons in _on_paused
var _dialogue_center := false  # dialogue text aligned center (wrap in [center] bbcode)
var _settings := {}   # live player settings (volumes, toggles) set from settings screens

var _awaiting := ""   # "say" | "choices" | "text_input" | "finished"
var _shot_mode := false
var _shot_particles := false
var _shot_now := false

# screen-shake state (px offset applied to the stage each frame while active)
var _shake_time := 0.0
var _shake_dur := 0.0
var _shake_amp := 0.0
var _stage_base := Vector2.ZERO   # stage position without shake (set by pan/zoom)

# typewriter reveal
const REVEAL_CPS := 45.0
var _full_text := ""
var _reveal := 0.0
var _revealing := false
var _reveal_cps := REVEAL_CPS       # per-line reveal speed (from line textSpeed or the global setting)
var _line_time_limit := 0.0         # per-line auto-advance timer (seconds), 0 = none
var _line_time_locked := false      # locked: clicks only reveal; only the timer advances
var _line_timer := 0.0
var _timer_bar: ProgressBar = null  # optional countdown bar (showTimer)
var _hl_pending := false            # reveal-highlight active: restore text colour when typing finishes
var _hl_base_color := Color.WHITE

# in-game controls: skip / auto-advance / backlog / quick menu
var _skipping := false
var _auto := false
var _skip_accum := 0.0
var _auto_accum := 0.0
const AUTO_DELAY := 1.6
const SKIP_INTERVAL := 0.04
var _backlog: Array = []          # {name, text} of every dialogue line seen
var _backlog_overlay: Control = null
var _quick_menu: Control = null
var _quick_menu_forced_hidden := false  # a reactive quick-menu state hid the bar

func _ready() -> void:
	_build_ui()
	var args := OS.get_cmdline_user_args()
	var bundle := ""
	for a in args:
		if a == "--shot": _shot_mode = true
		elif a == "--shot-particles": _shot_particles = true
		elif a == "--shot-now": _shot_now = true
		elif not a.begins_with("--"): bundle = a
	if bundle == "":
		# A converted (scaffolded) project embeds the game at res://bundle/. In the dev runtime that
		# folder doesn't exist, so fall back to the hello-dialogue sample.
		if FileAccess.file_exists("res://bundle/manifest.json"):
			bundle = ProjectSettings.globalize_path("res://bundle")
		else:
			bundle = ProjectSettings.globalize_path("res://") + "../format/samples/01-hello-dialogue"

	particle_fx.set_view_size(get_viewport_rect().size)
	overlay_fx.set_view_size(get_viewport_rect().size)
	stage.pivot_offset = get_viewport_rect().size * 0.5  # zoom about the center
	loader = BundleLoader.new()
	if not loader.load_bundle(bundle):
		text_label.text = "[Bundle error] " + str(loader.errors)
		panel.visible = true
		return
	for w in loader.warnings: push_warning(w)
	_apply_ingame_ui()
	state = VNGameState.new()
	state.init_from(loader.variables)
	_new_interpreter()
	# Launch on the title screen if the game has one; otherwise straight into the story.
	if loader.title_screen != "" and loader.ui_screens.has(loader.title_screen):
		_show_screen(loader.title_screen)
	else:
		interp.start()
	if _shot_mode:
		_run_shot_sequence()
	elif _shot_particles:
		_run_particle_shot()
	elif _shot_now:
		_run_now_shot()

func _new_interpreter() -> void:
	interp = VNInterpreter.new()
	interp.loader = loader
	interp.state = state
	interp.paused.connect(_on_paused)
	interp.stage.connect(_on_stage)

# ── custom UI screens ──

func _show_screen(id: String) -> void:
	if not loader.ui_screens.has(id): return
	_current_screen = id
	var scr: Dictionary = loader.ui_screens[id]
	# Overlay/HUD screens don't consume story input (passThrough) and can keep the dialogue box visible.
	_current_passthrough = scr.get("passThrough", false) or scr.get("hudNonBlocking", false)
	if not screen_view.visible:
		_panel_was_visible = panel.visible  # remember to restore when this screen closes
	if not scr.get("showDialogue", false):
		panel.visible = false               # hide the story dialogue box unless the screen wants it
	screen_view.build(scr, loader, _settings, state, _shown_elements)
	screen_view.visible = true
	# Static overlay atmosphere declared on the screen (shimmer/rain/fog/…): applied on open.
	_clear_screen_overlays()
	for ov in scr.get("overlays", []):
		if ov is Dictionary:
			_set_overlay(ov)
			_screen_overlays.append(str(ov.get("effectType", "")))

func _hide_screen() -> void:
	# On-close behaviour: run the screen's onCloseActions, then resume / advance the story per onCloseBehavior.
	if _current_screen != "" and loader.ui_screens.has(_current_screen):
		var scr: Dictionary = loader.ui_screens[_current_screen]
		for a in scr.get("onCloseActions", []):
			if a is Dictionary: _dispatch_game_action(a)
		if str(scr.get("onCloseBehavior", "")) == "advance" and _awaiting == "say":
			_awaiting = ""
			interp.advance()
	_current_passthrough = false
	screen_view.visible = false
	_current_screen = ""
	panel.visible = _panel_was_visible  # restore the story dialogue box state from before the screen opened
	_clear_screen_overlays()
	for c in screen_view.get_children():
		c.queue_free()

# Remove only overlays that a screen added (leaves any story-driven atmosphere intact).
func _clear_screen_overlays() -> void:
	for etype in _screen_overlays:
		_remove_overlay(etype)
	_screen_overlays.clear()

func _start_new_game(scene := "") -> void:
	state = VNGameState.new()
	state.init_from(loader.variables)
	_new_interpreter()
	particle_fx.clear()
	_clear_screen_fx_now()
	_hide_screen()
	interp.start(scene)

func _on_screen_action(a: Dictionary) -> void:
	match a.get("action"):
		"startNewGame":
			if not _confirm("newGame", _start_new_game): _start_new_game()
		"jumpToScene": _start_new_game(str(a.get("scene", "")))
		"goToScreen":
			var t = a.get("screen")
			if t != null and loader.ui_screens.has(t):
				_screen_stack.push_back(_current_screen)
				_show_screen(t)
		"back":
			if _screen_stack.size() > 0: _show_screen(str(_screen_stack.pop_back()))
			elif loader.title_screen != "": _show_screen(loader.title_screen)
		"returnToGame": _hide_screen()
		"quitToTitle":
			if not _confirm("quit", _quit_to_title): _quit_to_title()
		"quit":
			if not _confirm("quit", func() -> void: get_tree().quit()): get_tree().quit()
		"openUrl": if a.get("url"): OS.shell_open(str(a.get("url")))
		"setVar":
			if state: state.set_var_op(a.get("var"), a.get("op", "set"), a.get("value"))
			# A screen widget (checkbox/dropdown) changed a variable — rebuild so meters + conditional
			# elements reflect it. Text inputs omit `refresh` so typing doesn't rebuild mid-edit.
			if a.get("refresh", false) and _current_screen != "" and loader.ui_screens.has(_current_screen):
				screen_view.build(loader.ui_screens[_current_screen], loader, _settings, state, _shown_elements)
		"saveToSlot":
			interp.save_to_slot(int(a.get("slot", 1)))
			_show_screen(_current_screen)  # refresh so the slot shows as saved
		"eraseSlot":
			var es := int(a.get("slot", 1))
			var do_erase := func() -> void:
				VNInterpreter.erase_slot(es)
				_show_screen(_current_screen)  # refresh so the slot shows as empty
			if not _confirm("eraseSave", do_erase): do_erase.call()
		"loadFromSlot":
			if interp.load_from_slot(int(a.get("slot", 1))):
				_screen_stack.clear()
				particle_fx.clear()
				_clear_screen_fx_now()
				_hide_screen()
				interp.resume()
		"setSetting": _apply_setting(str(a.get("setting", "")), a.get("value"))
		_: _dispatch_game_action(a)  # share the full verb set with scene buttons

func _quit_to_title() -> void:
	_screen_stack.clear()
	if loader.title_screen != "": _show_screen(loader.title_screen)

# Rebuild the persistent in-game HUD (gameHudScreen) so its meters + conditional elements reflect state.
func _refresh_hud() -> void:
	var hud_id := str(loader.ui.get("gameHudScreen", "")) if loader.ui != null else ""
	if hud_id == "" or not loader.ui_screens.has(hud_id):
		return
	hud_view.build(loader.ui_screens[hud_id], loader, _settings, state, _shown_elements)
	_hud_active = true

# Show a confirmation popup for a destructive action (quit / newGame / eraseSave). Returns true if a
# dialog was shown (execution deferred to on_yes); false if no confirm is configured (caller executes).
func _confirm(kind: String, on_yes: Callable) -> bool:
	var cfg: Dictionary = loader.ui.get("confirm", {}) if loader.ui != null else {}
	var c: Dictionary = cfg.get(kind, {})
	if c.is_empty():
		return false
	var overlay := ColorRect.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.color = _to_color(c.get("overlay"), Color(0, 0, 0, 0.6))
	add_child(overlay)
	var vp := get_viewport_rect().size
	var box := PanelContainer.new()
	box.custom_minimum_size = Vector2(vp.x * 0.4, 0)
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.position = Vector2(vp.x * 0.3, vp.y * 0.38)
	var bsb := _flat_box(_to_color(c.get("bg"), Color(0.12, 0.13, 0.18, 0.98)), int(c.get("radius", 10)))
	bsb.content_margin_left = 24; bsb.content_margin_right = 24; bsb.content_margin_top = 20; bsb.content_margin_bottom = 20
	box.add_theme_stylebox_override("panel", bsb)
	overlay.add_child(box)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 16)
	box.add_child(vb)
	if str(c.get("title", "")) != "":
		var title := Label.new()
		title.text = str(c.get("title"))
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_apply_chrome_font(title, c.get("titleFont", { "fontSize": 26 }), false)
		vb.add_child(title)
	var msg := Label.new()
	msg.text = str(c.get("message", "Are you sure?"))
	msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	msg.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_apply_chrome_font(msg, c.get("messageFont", {}), false)
	vb.add_child(msg)
	var btns := HBoxContainer.new()
	btns.alignment = BoxContainer.ALIGNMENT_CENTER
	btns.add_theme_constant_override("separation", 14)
	vb.add_child(btns)
	var cancel := Button.new()
	cancel.text = str(c.get("cancel", "Cancel"))
	cancel.custom_minimum_size = Vector2(120, 40)
	if c.has("cancelColor"): cancel.add_theme_stylebox_override("normal", _flat_box(_to_color(c.get("cancelColor"), Color(0.3, 0.3, 0.3)), 6))
	cancel.pressed.connect(func() -> void: overlay.queue_free())
	var ok := Button.new()
	ok.text = str(c.get("confirm", "Yes"))
	ok.custom_minimum_size = Vector2(120, 40)
	if c.has("confirmColor"): ok.add_theme_stylebox_override("normal", _flat_box(_to_color(c.get("confirmColor"), Color(0.6, 0.2, 0.2)), 6))
	ok.pressed.connect(func() -> void:
		overlay.queue_free()
		on_yes.call())
	btns.add_child(cancel)
	btns.add_child(ok)
	ok.call_deferred("grab_focus")
	return true

func _apply_setting(setting: String, value) -> void:
	_settings[setting] = value
	var low := setting.to_lower()
	if value is float or value is int:
		var lin: float = clampf(float(value), 0.0001, 1.0)
		if low.contains("music"): music.volume_db = linear_to_db(lin)
		elif low.contains("master"): AudioServer.set_bus_volume_db(0, linear_to_db(lin))

func _process(delta: float) -> void:
	if interp != null:
		interp.play_time += delta
	if _flashlight_on:
		var view := get_viewport_rect().size
		var mp := get_viewport().get_mouse_position()
		(flashlight_rect.material as ShaderMaterial).set_shader_parameter("light_pos", mp / view)
	if _shake_time > 0.0:
		_shake_time -= delta
		if _shake_time <= 0.0:
			stage.position = _stage_base
		else:
			var falloff := _shake_time / _shake_dur  # ease out
			var amp := _shake_amp * falloff
			stage.position = _stage_base + Vector2(randf_range(-amp, amp), randf_range(-amp, amp))
	if _revealing:
		_reveal += _reveal_cps * delta
		if int(_reveal) >= _full_text.length():
			text_label.visible_characters = -1
			_revealing = false
			if _hl_pending:
				# reveal highlight: the text typed in the highlight colour — settle back to normal
				text_label.add_theme_color_override("default_color", _hl_base_color)
				_hl_pending = false
		else:
			text_label.visible_characters = int(_reveal)
	# Skip (Ctrl / quick-menu Skip): race through dialogue. Auto: advance a beat after each line finishes.
	# Both pause on choices/text-input and while the backlog is open.
	if _awaiting == "say" and _backlog_overlay == null and screen_view.visible == false:
		if _skipping:
			_skip_accum += delta
			if _skip_accum >= SKIP_INTERVAL:
				_skip_accum = 0.0
				text_label.visible_characters = -1
				_revealing = false
				_awaiting = ""
				interp.advance()
		elif _line_time_limit > 0.0 and not _revealing:
			# per-line time limit: advance on its own once the text has finished typing
			_line_timer += delta
			if _timer_bar != null:
				_timer_bar.value = clampf(1.0 - _line_timer / _line_time_limit, 0.0, 1.0)
			if _line_timer >= _line_time_limit:
				_awaiting = ""
				interp.advance()
		elif _auto and not _revealing:
			_auto_accum += delta
			if _auto_accum >= AUTO_DELAY:
				_auto_accum = 0.0
				_awaiting = ""
				interp.advance()
	# Quick menu + game HUD show only during live gameplay (hidden on screens / credits / backlog).
	var in_gameplay: bool = (not screen_view.visible) and _credit_overlay == null and _backlog_overlay == null and _awaiting != ""
	if _quick_menu != null:
		_quick_menu.visible = in_gameplay and not _quick_menu_forced_hidden
	if _hud_active:
		hud_view.visible = in_gameplay and not _quick_menu_forced_hidden

# ── UI construction ──

func _build_ui() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	stage = Control.new()  # everything pan/zoom/shake transforms
	stage.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(stage)

	var dim := ColorRect.new()  # base backdrop so empty bundles aren't pure black
	dim.color = Color(0.06, 0.07, 0.10)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(dim)

	bg = TextureRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(bg)

	bg2 = TextureRect.new()  # drawn above bg, below the character — crossfade layer
	bg2.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg2.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg2.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg2.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg2.modulate.a = 0.0
	stage.add_child(bg2)

	characters_holder = Control.new()
	characters_holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	characters_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(characters_holder)

	particle_fx = VNParticleFx.new()  # above the scene, below the dialogue box
	stage.add_child(particle_fx)

	# FX overlays — above the scene, below the dialogue UI
	flash_layer = ColorRect.new()
	flash_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	flash_layer.color = Color(1, 1, 1, 0)
	flash_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(flash_layer)

	tint_layer = ColorRect.new()
	tint_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	tint_layer.color = Color(0, 0, 0, 0)
	tint_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(tint_layer)

	overlay_fx = VNParticleFx.new()  # screen-space weather (not under `stage`, so pan/zoom won't move it)
	add_child(overlay_fx)

	flashlight_rect = ColorRect.new()  # spotlight darkness (above scene+weather, below the dialogue box)
	flashlight_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	flashlight_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fl_mat := ShaderMaterial.new()
	var fl_sh := Shader.new()
	fl_sh.code = FLASHLIGHT_SHADER
	fl_mat.shader = fl_sh
	flashlight_rect.material = fl_mat
	flashlight_rect.visible = false
	add_child(flashlight_rect)

	panel = Panel.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	panel.offset_left = 40
	panel.offset_right = -40
	panel.offset_top = -190
	panel.offset_bottom = -30
	panel.visible = false
	add_child(panel)

	name_label = Label.new()
	name_label.position = Vector2(24, 12)
	name_label.add_theme_font_size_override("font_size", 22)
	name_label.add_theme_color_override("font_color", Color(0.93, 0.16, 0.60))
	panel.add_child(name_label)

	text_label = RichTextLabel.new()
	text_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	text_label.offset_left = 24
	text_label.offset_top = 46
	text_label.offset_right = -24
	text_label.offset_bottom = -16
	text_label.add_theme_font_size_override("normal_font_size", 20)
	panel.add_child(text_label)

	choices_box = VBoxContainer.new()
	choices_box.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	choices_box.offset_left = -260
	choices_box.offset_right = 260
	choices_box.offset_top = -160
	choices_box.offset_bottom = 160
	choices_box.add_theme_constant_override("separation", 10)
	add_child(choices_box)

	text_input = LineEdit.new()
	text_input.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	text_input.offset_left = -220
	text_input.offset_right = 220
	text_input.offset_top = 20
	text_input.offset_bottom = 60
	text_input.visible = false
	text_input.text_submitted.connect(_on_text_submitted)
	add_child(text_input)

	# Scene-overlay elements (ShowImage/Text/Button/HotSpot) live here — above the dialogue box so buttons
	# and hotspots are clickable, below the custom screens. Screen-space (not under `stage`).
	_overlay_layer = Control.new()
	_overlay_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_overlay_layer)

	music = AudioStreamPlayer.new()
	add_child(music)
	sfx = AudioStreamPlayer.new()
	add_child(sfx)
	voice_player = AudioStreamPlayer.new()
	add_child(voice_player)

	hud_view = VNScreenView.new()  # persistent in-game HUD (gameHudScreen) — above dialogue, below menus
	hud_view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud_view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_view.visible = false
	hud_view.action.connect(_on_screen_action)
	add_child(hud_view)

	screen_view = VNScreenView.new()  # added last → drawn on top of the story
	screen_view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	screen_view.visible = false
	screen_view.action.connect(_on_screen_action)
	add_child(screen_view)

# ── In-Game UI styling (author's dialogue box / namebox / choice chrome) ──

# Restyle the built-in dialogue box, name plate and text from the bundle's ui.dialogueBox, and stash
# the choice styling for _on_paused. Everything is optional — absent fields keep the runtime defaults.
func _apply_ingame_ui() -> void:
	var ui: Dictionary = loader.ui if loader.ui != null else {}
	# initial game settings (volumes / text speed / skip / auto-advance)
	for k in ui.get("settings", {}):
		_settings[k] = ui["settings"][k]
		_apply_setting(str(k), ui["settings"][k])
	var db: Dictionary = ui.get("dialogueBox", {})
	var sz := get_viewport_rect().size

	# geometry: explicit x/y/% + width%/height-px, else bottom-centered with a bottom margin
	var pw := (float(db.get("width", 0)) / 100.0 * sz.x) if db.has("width") else (sz.x - 80.0)
	var ph := float(db.get("height", 0)) if db.has("height") else 160.0
	var px: float
	var py: float
	if db.has("x") and db.has("y"):
		px = float(db.get("x")) / 100.0 * sz.x
		py = float(db.get("y")) / 100.0 * sz.y
	else:
		px = (sz.x - pw) / 2.0
		py = sz.y - ph - float(db.get("bottomMargin", 30))
	panel.set_anchors_preset(Control.PRESET_TOP_LEFT)
	panel.position = Vector2(px, py)
	panel.size = Vector2(pw, ph)
	panel.custom_minimum_size = Vector2(pw, ph)

	var sb := _chrome_stylebox(db, Color(0.05, 0.05, 0.08, float(db.get("opacity", 0.85))))
	if sb != null:
		panel.add_theme_stylebox_override("panel", sb)

	# text: font + colour + optional centre alignment (via bbcode wrap so the typewriter still counts glyphs)
	var pad := float(db.get("padding", 20))
	text_label.bbcode_enabled = true
	text_label.offset_left = pad + 6
	text_label.offset_right = -(pad + 6)
	text_label.offset_top = 44
	text_label.offset_bottom = -(pad * 0.5 + 6)
	var tf: Dictionary = db.get("textFont", {})
	_apply_chrome_font(text_label, tf, true)
	_dialogue_center = str(tf.get("align", "")) == "center"

	# name plate
	name_label.position = Vector2(pad + 8, 10)
	_apply_chrome_font(name_label, db.get("nameFont", {}), false)
	# name plate background (ui.namebox: image or colour+radius), offset, if the author styled it
	var nb: Dictionary = ui.get("namebox", {})
	if not nb.is_empty():
		var nbox := _chrome_stylebox(nb, Color(0, 0, 0, 0))
		if nbox != null:
			name_label.add_theme_stylebox_override("normal", nbox)
		name_label.position += Vector2(float(nb.get("offsetX", 0)), float(nb.get("offsetY", 0)))

	# input box (text-input prompt field): background + field font from ui.inputBox
	var ib: Dictionary = ui.get("inputBox", {})
	if not ib.is_empty():
		var ibox := _chrome_stylebox(ib, Color(0.1, 0.1, 0.12, 0.92))
		if ibox != null:
			text_input.add_theme_stylebox_override("normal", ibox)
		_apply_chrome_font(text_input, ib.get("fieldFont", {}), false)

	_choice_style = ui.get("choiceMenu", {})
	_build_quick_menu()

# Build a StyleBox for a chrome piece: a stretched image if given, else a flat colour+radius box.
func _chrome_stylebox(cfg: Dictionary, fallback: Color) -> StyleBox:
	var img := loader.load_texture(cfg.get("image"))
	if img != null:
		var st := StyleBoxTexture.new()
		st.texture = img
		return st
	if cfg.has("color") or cfg.has("borderRadius") or cfg.has("opacity"):
		var col := _to_color(cfg.get("color"), fallback)
		if cfg.has("opacity"):
			col.a = float(cfg.get("opacity"))
		var box := StyleBoxFlat.new()
		box.bg_color = col
		var r := int(cfg.get("borderRadius", 6))
		box.corner_radius_top_left = r
		box.corner_radius_top_right = r
		box.corner_radius_bottom_left = r
		box.corner_radius_bottom_right = r
		return box
	return null

# Apply a resolved chrome font ({fontSize,color,bold,italic,font,align}) to a Label/RichTextLabel.
func _apply_chrome_font(node: Control, f: Dictionary, rich: bool) -> void:
	if f.is_empty():
		return
	var ff := loader.load_font(f.get("font")) if f.has("font") else null
	var size_key := "normal_font_size" if rich else "font_size"
	var font_key := "normal_font" if rich else "font"
	var color_key := "default_color" if rich else "font_color"
	if ff != null:
		node.add_theme_font_override(font_key, ff)
	if f.has("fontSize"):
		node.add_theme_font_size_override(size_key, int(f.get("fontSize")))
	if f.has("color"):
		node.add_theme_color_override(color_key, _to_color(f.get("color"), Color.WHITE))
	if not rich and node is Label:
		if str(f.get("align", "")) == "center": node.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		elif str(f.get("align", "")) == "right": node.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

func _to_color(s, fallback: Color) -> Color:
	if s is String and s != "" and Color.html_is_valid(s):
		return Color.html(s)
	return fallback

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

# Apply the author's choiceMenu styling (image/hover art or colour+radius, plus font) to a choice button.
func _style_choice_button(b: Button) -> void:
	if _choice_style.is_empty():
		return
	var img := loader.load_texture(_choice_style.get("image"))
	if img != null:
		var sb := StyleBoxTexture.new()
		sb.texture = img
		b.add_theme_stylebox_override("normal", sb)
		var hov := loader.load_texture(_choice_style.get("hoverImage"))
		var sbh := StyleBoxTexture.new()
		sbh.texture = hov if hov != null else img
		b.add_theme_stylebox_override("hover", sbh)
		b.add_theme_stylebox_override("focus", sbh)
		b.add_theme_stylebox_override("pressed", sbh)
	elif _choice_style.has("color") or _choice_style.has("borderRadius"):
		var box := _chrome_stylebox(_choice_style, Color(0.2, 0.2, 0.2, 0.9))
		if box != null:
			b.add_theme_stylebox_override("normal", box)
	var cf: Dictionary = _choice_style.get("textFont", {})
	if not cf.is_empty():
		var ff := loader.load_font(cf.get("font")) if cf.has("font") else null
		if ff != null:
			b.add_theme_font_override("font", ff)
		if cf.has("fontSize"):
			b.add_theme_font_size_override("font_size", int(cf.get("fontSize")))
		if cf.has("color"):
			b.add_theme_color_override("font_color", _to_color(cf.get("color"), Color.WHITE))
	if _choice_style.has("height"):
		b.custom_minimum_size.y = float(_choice_style.get("height"))

# ── interpreter callbacks ──

func _on_paused(ev: Dictionary) -> void:
	_clear_choices()
	text_input.visible = false
	_revealing = false
	text_label.visible_characters = -1  # non-say text shows in full
	_line_time_limit = 0.0
	_line_time_locked = false
	_set_timer_bar(false)
	match ev.get("kind"):
		"creditRoll":
			panel.visible = false
			_awaiting = "credits"
			_start_credit_roll(ev.get("node", {}))
		"say":
			panel.visible = true
			name_label.text = str(ev.get("name", ""))
			name_label.visible = name_label.text != ""
			_full_text = str(ev.get("text", ""))
			var shown := _apply_text_effect(_full_text, ev.get("effects", []))
			text_label.text = ("[center]" + shown + "[/center]") if _dialogue_center else shown
			text_label.visible_characters = 0
			_reveal = 0.0
			_revealing = _full_text.length() > 0
			_awaiting = "say"
			_auto_accum = 0.0
			# per-line reveal speed: line override → global text-speed setting → default
			var ts = ev.get("textSpeed")
			if ts == null: ts = _settings.get("textSpeed")
			_reveal_cps = clampf(float(ts), 5.0, 300.0) if ts != null else REVEAL_CPS
			# play this line's voice clip; if voice-paced, finish typing exactly when the voice ends
			var vlen := _play_voice(ev.get("voice"))
			if vlen > 0.0 and _full_text.length() > 0 and loader.ui != null and loader.ui.get("voicePacedText", false):
				_reveal_cps = clampf(float(_full_text.length()) / vlen, 5.0, 300.0)
			# per-line time limit (auto-advance) + optional locked pacing + countdown bar
			_line_time_limit = float(ev.get("timeLimit", 0))
			_line_time_locked = bool(ev.get("timeLimitLocked", false))
			_line_timer = 0.0
			_set_timer_bar(_line_time_limit > 0.0 and bool(ev.get("showTimer", false)))
			_apply_speaker_emphasis(ev.get("speaker"))
			_apply_reactive_ui(ev)
			_refresh_hud()
			_backlog.append({ "name": name_label.text, "text": _full_text })  # record for the log
		"choices":
			# keepOpenDuringChoices: keep the previous line's dialogue box open under the choices.
			var keep_text := str(ev.get("keepText", ""))
			if keep_text != "":
				panel.visible = true
				name_label.text = str(ev.get("keepName", ""))
				name_label.visible = name_label.text != ""
				text_label.text = keep_text
			else:
				var prompt := str(ev.get("prompt", ""))
				panel.visible = prompt != ""
				name_label.visible = false
				text_label.text = prompt
			var options: Array = ev.get("options", [])
			for i in options.size():
				var b := Button.new()
				b.text = str(options[i].get("text", ""))
				b.custom_minimum_size = Vector2(0, 44)
				_style_choice_button(b)
				var idx: int = i
				b.pressed.connect(func() -> void: _pick(idx))
				choices_box.add_child(b)
			if choices_box.get_child_count() > 0:
				choices_box.get_child(0).grab_focus()
			_awaiting = "choices"
		"text_input":
			panel.visible = str(ev.get("prompt", "")) != ""
			name_label.visible = false
			text_label.text = str(ev.get("prompt", ""))
			text_input.text = ""
			text_input.visible = true
			text_input.grab_focus()
			_awaiting = "text_input"
		"finished":
			panel.visible = true
			name_label.visible = false
			text_label.text = "[center]— The End —[/center]"
			_awaiting = "finished"

func _on_stage(ev: Dictionary) -> void:
	var n = ev.get("node", {})
	match ev.get("kind"):
		"setBackground":
			_set_background(loader.load_texture(n.get("image")), n.get("transition"))
		"showCharacter":
			_show_char(n)
		"setCharacterSprite":
			_show_char(n)
		"hideCharacter":
			_hide_char(n.get("character"), n.get("transition"))
		"moveCharacter":
			_move_char(n.get("character"), n.get("to"), float(n.get("durationMs", 300)))
		"playMusic":
			_play_music(n.get("audio"))
		"stopMusic":
			music.stop()
		"playSound":
			_play_sfx(n.get("audio"), n.get("volume", 1.0))
		"stopSound":
			sfx.stop()
		"spawnParticles":
			particle_fx.spawn(str(n.get("tag", "p")), n.get("config", {}))
		"stopParticles":
			var tg = n.get("tag")
			if tg == null or str(tg) == "": particle_fx.clear()
			else: particle_fx.stop(str(tg))
		"shakeScreen": _shake_screen(n.get("params", {}))
		"flashScreen": _flash_screen(n.get("params", {}))
		"tintScreen": _tint_screen(n.get("params", {}))
		"panZoomScreen": _pan_zoom_screen(n.get("params", {}))
		"resetScreenEffects": _reset_screen_fx()
		"setScreenOverlay": _set_overlay(n.get("params", {}))
		"lightning": _lightning(n.get("params", {}))
		"flashlight": _flashlight(n.get("params", {}))
		"fireworks": _fireworks(n.get("params", {}))
		"placeLights": _place_lights(n.get("params", {}))
		"clearLights": _clear_lights()
		"playMovie": _play_movie(n)
		"stopMovie": _stop_movie()
		"setTimeOfDay": _set_time_of_day(n.get("params", {}))
		"showScreen":
			var sid = n.get("screen")
			if sid != null and loader.ui_screens.has(sid): _show_screen(str(sid))
		"showImage": _show_overlay_image(n)
		"showText": _show_overlay_text(n)
		"showButton": _show_overlay_button(n)
		"showHotSpot": _show_overlay_hotspot(n)
		"hideElement": _hide_overlay(str(n.get("target", "")), n.get("transition"))
		"tween": _tween_element(n)

func _transition_secs(transition, default_secs: float) -> float:
	if transition is Dictionary and transition.get("type", "") != "cut":
		return float(transition.get("durationMs", default_secs * 1000.0)) / 1000.0
	return 0.0

func _set_background(tex: Texture2D, transition) -> void:
	var dur := _transition_secs(transition, 0.4)
	if tex == null:
		bg.texture = null
		return
	if dur <= 0.0 or bg.texture == null:
		bg.texture = tex
		return
	# crossfade: fade the new image in on the overlay, then swap it down to the base
	bg2.texture = tex
	bg2.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(bg2, "modulate:a", 1.0, dur)
	tw.tween_callback(func() -> void:
		bg.texture = tex
		bg2.modulate.a = 0.0)

# Show or update one character (multi-character: each keyed by id, placed by its position).
func _show_char(n: Dictionary) -> void:
	var char_id = n.get("character")
	var node: Control = _characters.get(char_id)
	var is_new := node == null
	if is_new:
		node = Control.new()
		node.mouse_filter = Control.MOUSE_FILTER_IGNORE
		characters_holder.add_child(node)
		_characters[char_id] = node
	else:
		for c in node.get_children():
			c.queue_free()
	for ref in loader.character_sprite_layers(char_id, n.get("sprite")):
		var tex := loader.load_texture(ref)
		if tex == null: continue
		var tr := TextureRect.new()
		tr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if n.get("flipX", false): tr.flip_h = true
		tr.texture = tex
		node.add_child(tr)
	_place_char(node, n.get("position"), float(n.get("scale", 1)))
	if is_new:
		var dur := _transition_secs(n.get("transition"), 0.3)
		node.modulate.a = 0.0 if dur > 0.0 else 1.0
		if dur > 0.0:
			create_tween().tween_property(node, "modulate:a", 1.0, dur)

# Size + position a character node: a bottom-standing column centered on its position.x fraction.
func _place_char(node: Control, position, scale: float) -> void:
	var vp := get_viewport_rect().size
	var band_w := vp.x * 0.5 * scale
	var band_h := vp.y * 0.95 * scale
	node.set_anchors_preset(Control.PRESET_TOP_LEFT)
	node.size = Vector2(band_w, band_h)
	node.custom_minimum_size = Vector2(band_w, band_h)
	node.pivot_offset = Vector2(band_w * 0.5, band_h)
	node.position = Vector2(_char_pos_x(position) * vp.x - band_w * 0.5, vp.y - band_h)

func _char_pos_x(position) -> float:
	if position is Dictionary and position.has("x"):
		return float(position.get("x"))       # already a 0..1 fraction from the exporter
	match str(position):
		"left": return 0.25
		"right": return 0.75
		_: return 0.5

func _hide_char(char_id, transition) -> void:
	var node: Control = _characters.get(char_id)
	if node == null: return
	_characters.erase(char_id)
	var dur := _transition_secs(transition, 0.3)
	if dur > 0.0:
		var tw := create_tween()
		tw.tween_property(node, "modulate:a", 0.0, dur)
		tw.tween_callback(node.queue_free)
	else:
		node.queue_free()

func _move_char(char_id, to, duration_ms: float) -> void:
	var node: Control = _characters.get(char_id)
	if node == null: return
	var vp := get_viewport_rect().size
	var target_x := _char_pos_x(to) * vp.x - node.size.x * 0.5
	var dur := duration_ms / 1000.0
	if dur > 0.0:
		create_tween().tween_property(node, "position:x", target_x, dur)
	else:
		node.position.x = target_x

func _clear_characters() -> void:
	for id in _characters.keys():
		_characters[id].queue_free()
	_characters.clear()

# Speaker emphasis: on each line, dim the non-speaking characters and scale the speaker (if enabled).
func _apply_speaker_emphasis(speaker_id) -> void:
	var em: Dictionary = loader.ui.get("emphasis", {}) if loader.ui != null else {}
	if not em.get("enabled", false):
		return
	var dim := float(em.get("dim", 0.5))
	var scl := float(em.get("scale", 1.0))
	for id in _characters:
		var node: Control = _characters[id]
		var is_speaker: bool = str(id) == str(speaker_id)
		var b := 1.0 if is_speaker else dim
		var s := scl if is_speaker else 1.0
		var tw := create_tween().set_parallel(true)
		tw.tween_property(node, "modulate", Color(b, b, b, node.modulate.a), 0.25)
		tw.tween_property(node, "scale", Vector2(s, s), 0.25)

func _play_music(ref) -> void:
	var path := loader.asset_path(ref)
	if path == "" or not FileAccess.file_exists(path): return
	var stream: AudioStream = null
	var ext := path.get_extension().to_lower()
	if ext == "ogg":
		stream = AudioStreamOggVorbis.load_from_file(path)
	elif ext == "mp3":
		var mp3 := AudioStreamMP3.new()
		mp3.data = FileAccess.get_file_as_bytes(path)
		stream = mp3
	if stream != null:
		music.stream = stream
		music.play()

# ── screen FX (shake / flash / tint / pan-zoom) ──

func _fx_color(p: Dictionary, key: String, fallback: Color) -> Color:
	var s = p.get(key, "")
	return Color.html(s) if (s is String and s != "" and Color.html_is_valid(s)) else fallback

func _shake_screen(p: Dictionary) -> void:
	_shake_dur = maxf(0.05, float(p.get("duration", 0.5)))
	_shake_time = _shake_dur
	_shake_amp = clampf(float(p.get("intensity", 5)), 1.0, 10.0) * 3.0

func _flash_screen(p: Dictionary) -> void:
	var c := _fx_color(p, "color", Color.WHITE)
	flash_layer.color = Color(c.r, c.g, c.b, 1.0)
	create_tween().tween_property(flash_layer, "color:a", 0.0, maxf(0.05, float(p.get("duration", 0.3))))

func _tint_screen(p: Dictionary) -> void:
	var c := _fx_color(p, "color", Color.BLACK)
	var target := Color(c.r, c.g, c.b, clampf(float(p.get("opacity", 100)) / 100.0, 0.0, 1.0))
	var dur := maxf(0.0, float(p.get("duration", 0.5)))
	if dur <= 0.0:
		tint_layer.color = target
	else:
		tint_layer.color = Color(c.r, c.g, c.b, tint_layer.color.a)
		create_tween().tween_property(tint_layer, "color", target, dur)

func _pan_zoom_screen(p: Dictionary) -> void:
	var zoom := clampf(float(p.get("zoom", 1)), 0.1, 5.0)
	var vp := get_viewport_rect().size
	var pan_pt := Vector2(float(p.get("panX", 50)), float(p.get("panY", 50))) / 100.0 * vp
	_stage_base = -(pan_pt - vp * 0.5) * zoom
	var dur := maxf(0.0, float(p.get("duration", 0.5)))
	if dur <= 0.0:
		stage.scale = Vector2(zoom, zoom)
		stage.position = _stage_base
	else:
		var tw := create_tween().set_parallel(true)
		tw.tween_property(stage, "scale", Vector2(zoom, zoom), dur)
		tw.tween_property(stage, "position", _stage_base, dur)

func _reset_screen_fx() -> void:
	_shake_time = 0.0
	_stage_base = Vector2.ZERO
	var tw := create_tween().set_parallel(true)
	tw.tween_property(stage, "scale", Vector2.ONE, 0.3)
	tw.tween_property(stage, "position", Vector2.ZERO, 0.3)
	tw.tween_property(tint_layer, "color", Color(0, 0, 0, 0), 0.3)
	flash_layer.color = Color(1, 1, 1, 0)
	_clear_overlays()

func _clear_screen_fx_now() -> void:
	_shake_time = 0.0
	_stage_base = Vector2.ZERO
	stage.scale = Vector2.ONE
	stage.position = Vector2.ZERO
	tint_layer.color = Color(0, 0, 0, 0)
	flash_layer.color = Color(1, 1, 1, 0)
	_clear_overlays()
	_clear_overlay_elements()
	if _credit_overlay != null:
		_credit_overlay.queue_free()
		_credit_overlay = null
	if _backlog_overlay != null:
		_backlog_overlay.queue_free()
		_backlog_overlay = null
	_skipping = false
	_auto = false
	_shown_elements.clear()
	if voice_player != null: voice_player.stop()
	_stop_movie()
	# reset the day/night grade to neutral
	if _daynight_tint != null:
		_daynight_tint.color = Color(0, 0, 0, 0)
	bg.self_modulate = Color.WHITE
	bg2.self_modulate = Color.WHITE
	characters_holder.modulate = Color(1, 1, 1, 1)
	_clear_characters()
	if _grade_mat != null:
		_grade_mat.set_shader_parameter("saturation", 1.0)

# ── atmosphere: weather/light overlays + lightning ──

func _clear_overlays() -> void:
	overlay_fx.clear()
	for k in _overlay_rects.keys():
		_overlay_rects[k].queue_free()
	_overlay_rects.clear()
	flashlight_rect.visible = false
	_flashlight_on = false
	_clear_lights()

func _set_overlay(p: Dictionary) -> void:
	var etype := str(p.get("effectType", ""))
	var intensity := clampf(float(p.get("intensity", 1)), 0.0, 1.0)
	_remove_overlay(etype)
	if intensity <= 0.0:
		return
	match etype:
		"rain": overlay_fx.spawn("ov_rain", _rain_cfg(intensity))
		"snowAsh": overlay_fx.spawn("ov_snow", _snow_cfg(intensity, str(p.get("variant", "snow"))))
		"fog", "haze", "smoke": _overlay_rect(etype, _weather_color(etype, p.get("color")), intensity * 0.45, false)
		"sunbeams", "shimmer": _overlay_rect(etype, _fx_color(p, "color", Color(1, 0.95, 0.8)), intensity * 0.18, true)
		"crtScanlines": _shader_overlay("crtScanlines", CRT_SHADER, { "strength": intensity * 0.35 })
		"chromaticGlitch": _shader_overlay("chromaticGlitch", GLITCH_SHADER, { "amount": intensity * 0.006 })
		_: pass  # fireworks / lights have their own commands

func _remove_overlay(etype: String) -> void:
	if etype == "rain": overlay_fx.stop("ov_rain")
	elif etype == "snowAsh": overlay_fx.stop("ov_snow")
	if _overlay_rects.has(etype):
		_overlay_rects[etype].queue_free()
		_overlay_rects.erase(etype)

func _overlay_rect(etype: String, color: Color, alpha: float, additive: bool) -> void:
	var r := ColorRect.new()
	r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	r.color = Color(color.r, color.g, color.b, alpha)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if additive:
		var m := CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		r.material = m
	add_child(r)
	move_child(r, tint_layer.get_index() + 1)  # above the scene, below the dialogue box
	_overlay_rects[etype] = r

# A full-screen shader overlay (crt / glitch), tracked like any other overlay so _remove_overlay frees it.
func _shader_overlay(etype: String, code: String, params: Dictionary) -> void:
	var r := ColorRect.new()
	r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = code
	mat.shader = sh
	for k in params:
		mat.set_shader_parameter(k, params[k])
	r.material = mat
	add_child(r)
	move_child(r, tint_layer.get_index() + 1)
	_overlay_rects[etype] = r

# ── fireworks (a short volley of exploding sparks) ──

func _fireworks(p: Dictionary) -> void:
	var colors: Array = p.get("colors", [])
	if colors.is_empty():
		colors = ["#ff5555", "#ffdd55", "#55ddff", "#ff66cc", "#66ff88"]
	var bursts := maxi(1, int(p.get("bursts", 3)))
	var duration := maxf(0.5, float(p.get("duration", 2.5)))
	var intensity := clampf(float(p.get("intensity", 1)), 0.0, 1.0)
	var burst_h := clampf(float(p.get("burstHeight", 0.7)), 0.0, 1.0)
	var on_top: bool = bool(p.get("affectsDialogue", true))  # default: in front of the dialogue box
	var vp := get_viewport_rect().size
	for i in bursts:
		var col := _to_color(colors[i % colors.size()], Color.WHITE)
		var pos := Vector2(randf_range(0.2, 0.8) * vp.x, (1.0 - burst_h) * vp.y + randf_range(-40.0, 40.0))
		var delay := (float(i) / float(bursts)) * duration * 0.6
		var t := create_tween()
		t.tween_interval(delay)
		t.tween_callback(func() -> void: _spawn_burst(pos, col, intensity, on_top))

func _spawn_burst(pos: Vector2, col: Color, intensity: float, on_top: bool) -> void:
	var ps := CPUParticles2D.new()
	ps.position = pos
	ps.one_shot = true
	ps.explosiveness = 1.0
	ps.amount = 64
	ps.lifetime = 1.3
	ps.direction = Vector2(0, -1)
	ps.spread = 180.0
	ps.initial_velocity_min = 120.0
	ps.initial_velocity_max = 340.0
	ps.gravity = Vector2(0, 240)
	ps.scale_amount_min = 2.0
	ps.scale_amount_max = 3.5
	var ramp := Gradient.new()
	ramp.set_color(0, Color(col.r, col.g, col.b, intensity))
	ramp.set_color(1, Color(col.r, col.g, col.b, 0.0))
	ps.color_ramp = ramp
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	ps.material = mat
	add_child(ps)
	if not on_top:
		move_child(ps, panel.get_index())  # behind the dialogue box
	ps.emitting = true
	get_tree().create_timer(2.5).timeout.connect(ps.queue_free)

# ── placed twinkling lights (candle / star / christmas) ──

func _place_lights(p: Dictionary) -> void:
	_clear_lights()
	var lights: Array = p.get("lights", [])
	var above: bool = bool(p.get("aboveCharacters", false))
	var vp := get_viewport_rect().size
	_lights_holder = Node2D.new()
	stage.add_child(_lights_holder)  # under `stage` so lights pan/zoom with the scene
	# behind characters (default) or in front of them
	_lights_holder.z_index = 1 if above else -1
	for L in lights:
		if L is Dictionary:
			_lights_holder.add_child(_make_glow(L, vp))

func _clear_lights() -> void:
	if _lights_holder != null:
		_lights_holder.queue_free()
		_lights_holder = null

func _make_glow(L: Dictionary, vp: Vector2) -> Node2D:
	var s := Sprite2D.new()
	s.texture = _glow_tex()
	var typ := str(L.get("type", "candle"))
	var col := _to_color(L.get("color"), Color(1.0, 0.8, 0.45))
	if typ == "candle":
		col = Color(1.0, 0.75, 0.4)  # candle is always warm
	var bright := clampf(float(L.get("brightness", 1)), 0.0, 1.0)
	s.modulate = Color(col.r, col.g, col.b, bright)
	s.position = Vector2(float(L.get("x", 50)) / 100.0 * vp.x, float(L.get("y", 50)) / 100.0 * vp.y)
	var sz := float(L.get("size", 1))
	s.scale = Vector2(sz, sz)
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	s.material = mat
	_twinkle(s, str(L.get("twinkle", "fade")), float(L.get("twinkleSpeed", 1)), bright)
	return s

func _glow_tex() -> Texture2D:
	if _glow_texture != null:
		return _glow_texture
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = 128
	gt.height = 128
	_glow_texture = gt
	return gt

func _twinkle(s: Sprite2D, style: String, speed: float, base: float) -> void:
	if style == "steady":
		return
	var dur := 1.0 / maxf(0.2, speed)
	var t := create_tween().set_loops()
	if style == "blink":
		t.tween_property(s, "modulate:a", base * 0.15, dur * 0.5)
		t.tween_property(s, "modulate:a", base, dur * 0.5)
	else:  # fade / chase — a gentle breathing glow
		t.tween_property(s, "modulate:a", base * 0.55, dur)
		t.tween_property(s, "modulate:a", base, dur)

# ── video (PlayMovie / StopMovie) ──

func _play_movie(n: Dictionary) -> void:
	var path := loader.asset_path(n.get("video"))
	if path == "" or not FileAccess.file_exists(path):
		push_warning("PlayMovie: video not found — skipped")
		return
	var ext := path.get_extension().to_lower()
	if ext != "ogv":
		# Godot 4.3 plays only Ogg Theora natively; other codecs need a plugin the user adds themselves.
		push_warning("PlayMovie: only .ogv is supported natively (got .%s) — skipped" % ext)
		return
	_stop_movie()
	var p: Dictionary = n.get("params", {})
	_movie = VideoStreamPlayer.new()
	var vs := VideoStreamTheora.new()
	vs.file = path
	_movie.stream = vs
	_movie.loop = bool(p.get("loop", false))
	_movie.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var vp := get_viewport_rect().size
	if str(p.get("displayMode", "fullscreen")) == "overlay" and (p.has("x") or p.has("width")):
		_movie.position = Vector2(float(p.get("x", 0)) / 100.0 * vp.x, float(p.get("y", 0)) / 100.0 * vp.y)
		_movie.size = Vector2(float(p.get("width", 100)) / 100.0 * vp.x, float(p.get("height", 100)) / 100.0 * vp.y)
	else:
		_movie.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if p.has("opacity"):
		_movie.modulate.a = clampf(float(p.get("opacity")), 0.0, 1.0)
	add_child(_movie)
	# fullscreen movies cover everything; overlay movies sit below the dialogue box
	if str(p.get("displayMode", "fullscreen")) == "overlay":
		move_child(_movie, panel.get_index())
	if not _movie.loop:
		_movie.finished.connect(_stop_movie)
	_movie.play()

func _stop_movie() -> void:
	if _movie != null:
		_movie.queue_free()
		_movie = null

# ── day/night colour grade (SetTimeOfDay) ──

func _set_time_of_day(p: Dictionary) -> void:
	var dn = loader.ui.get("dayNight") if loader.ui != null else null
	if dn == null:
		return
	var phases: Array = dn.get("phases", [])
	if phases.is_empty():
		return
	if str(p.get("mode", "set")) == "advance":
		_day_hour = fposmod(_day_hour + float(p.get("hours", 0)), 24.0)
	else:
		_day_hour = fposmod(float(p.get("hour", 12)), 24.0)
	var grade := _compute_grade(_day_hour, phases)
	_apply_grade(grade, float(p.get("transitionDuration", 0)))

# Interpolate the grade for an hour across the phases, wrapping past midnight (mirrors dayNightGrade.ts).
func _compute_grade(hour: float, phases: Array) -> Dictionary:
	var sorted := phases.duplicate()
	sorted.sort_custom(func(a, b): return float(a.get("atHour", 0)) < float(b.get("atHour", 0)))
	if sorted.size() == 1:
		return { "background": sorted[0].get("background", {}), "sprites": sorted[0].get("sprites", {}) }
	var lo: Dictionary = sorted[sorted.size() - 1]
	var hi: Dictionary = sorted[0]
	for i in sorted.size():
		var at := float(sorted[i].get("atHour", 0))
		if at <= hour and (i == sorted.size() - 1 or float(sorted[i + 1].get("atHour", 0)) > hour):
			lo = sorted[i]
			hi = sorted[(i + 1) % sorted.size()]
			break
	var span := float(hi.get("atHour", 0)) - float(lo.get("atHour", 0))
	if span <= 0.0: span += 24.0
	var pos := hour - float(lo.get("atHour", 0))
	if pos < 0.0: pos += 24.0
	var t := clampf(pos / span, 0.0, 1.0) if span > 0.0 else 0.0
	return {
		"background": _lerp_layer(lo.get("background", {}), hi.get("background", {}), t),
		"sprites": _lerp_layer(lo.get("sprites", {}), hi.get("sprites", {}), t),
	}

func _lerp_layer(a: Dictionary, b: Dictionary, t: float) -> Dictionary:
	var ao := float(a.get("tintOpacity", 0)) if a.get("enabled", true) else 0.0
	var bo := float(b.get("tintOpacity", 0)) if b.get("enabled", true) else 0.0
	var asat := float(a.get("saturation", 1)) if a.get("enabled", true) else 1.0
	var bsat := float(b.get("saturation", 1)) if b.get("enabled", true) else 1.0
	return {
		"tint": _to_color(a.get("tint", "#ffffff"), Color.WHITE).lerp(_to_color(b.get("tint", "#ffffff"), Color.WHITE), t),
		"tintOpacity": lerpf(ao, bo, t),
		"brightness": lerpf(float(a.get("brightness", 1)), float(b.get("brightness", 1)), t),
		"saturation": lerpf(asat, bsat, t),
	}

func _apply_grade(grade: Dictionary, dur: float) -> void:
	var bg_grade: Dictionary = grade.get("background", {})
	var sp_grade: Dictionary = grade.get("sprites", {})
	# background tint overlay (created once, lives under `stage` above the backgrounds, below characters)
	if _daynight_tint == null:
		_daynight_tint = ColorRect.new()
		_daynight_tint.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_daynight_tint.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stage.add_child(_daynight_tint)
		stage.move_child(_daynight_tint, bg2.get_index() + 1)
	var btint := bg_grade.get("tint", Color.WHITE) as Color
	var bg_target := Color(btint.r, btint.g, btint.b, float(bg_grade.get("tintOpacity", 0)))
	var bb := float(bg_grade.get("brightness", 1))
	var bg_mod := Color(bb, bb, bb, 1)
	# background saturation via a shared shader on bg/bg2 (set instantly; brightness/tint still tween)
	if _grade_mat == null:
		_grade_mat = ShaderMaterial.new()
		var sh := Shader.new()
		sh.code = SATURATION_SHADER
		_grade_mat.shader = sh
		bg.material = _grade_mat
		bg2.material = _grade_mat
	_grade_mat.set_shader_parameter("saturation", float(bg_grade.get("saturation", 1)))
	# sprite grade folds tint+brightness into the character container's modulate (preserving its alpha)
	var stint := sp_grade.get("tint", Color.WHITE) as Color
	var so := float(sp_grade.get("tintOpacity", 0))
	var sbr := float(sp_grade.get("brightness", 1))
	var ch_rgb := Color(lerpf(1.0, stint.r, so) * sbr, lerpf(1.0, stint.g, so) * sbr, lerpf(1.0, stint.b, so) * sbr, 1)
	if dur <= 0.0:
		_daynight_tint.color = bg_target
		bg.self_modulate = bg_mod
		bg2.self_modulate = bg_mod
		characters_holder.modulate = Color(ch_rgb.r, ch_rgb.g, ch_rgb.b, 1)
	else:
		var tw := create_tween().set_parallel(true)
		tw.tween_property(_daynight_tint, "color", bg_target, dur)
		tw.tween_property(bg, "self_modulate", bg_mod, dur)
		tw.tween_property(bg2, "self_modulate", bg_mod, dur)
		tw.tween_property(characters_holder, "modulate", Color(ch_rgb.r, ch_rgb.g, ch_rgb.b, 1), dur)

# ── scene-overlay elements (ShowImage/ShowText/ShowButton/ShowHotSpot) + their actions ──

# % geometry → a node's position/size under `stage` (so overlays pan/zoom with the scene). anchorX/Y
# (default 0 for image/text, 0.5 for buttons) is the pivot point at (x,y).
func _place_overlay(node: Control, n: Dictionary, default_anchor := 0.0) -> void:
	var vp := get_viewport_rect().size
	var w := float(n.get("width", 20)) / 100.0 * vp.x
	var h := float(n.get("height", 10)) / 100.0 * vp.y
	var ax := float(n.get("anchorX", default_anchor))
	var ay := float(n.get("anchorY", default_anchor))
	node.set_anchors_preset(Control.PRESET_TOP_LEFT)
	node.position = Vector2(float(n.get("x", 0)) / 100.0 * vp.x - ax * w, float(n.get("y", 0)) / 100.0 * vp.y - ay * h)
	node.size = Vector2(w, h)
	node.pivot_offset = Vector2(w * 0.5, h * 0.5)
	if n.has("rotation"):
		node.rotation_degrees = float(n.get("rotation"))

# Add a built overlay node to the stage under this element's id, replacing any prior element with that
# id, and fade it in if the command carried a transition.
func _register_overlay(id: String, node: Control, n: Dictionary) -> void:
	if id != "" and _overlay_elements.has(id):
		_overlay_elements[id].queue_free()
	_overlay_layer.add_child(node)
	if id != "":
		_overlay_elements[id] = node
	var target_a := clampf(float(n.get("opacity", 1)), 0.0, 1.0)
	node.modulate.a = target_a
	var tr = n.get("transition")
	if tr is Dictionary and str(tr.get("type", "")) != "cut":
		var dur := _transition_secs(tr, 0.3)
		if dur > 0.0:
			node.modulate.a = 0.0
			create_tween().tween_property(node, "modulate:a", target_a, dur)

func _show_overlay_image(n: Dictionary) -> void:
	var tex := loader.load_texture(n.get("image"))
	var tr := TextureRect.new()
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tr.texture = tex
	if n.get("flipX", false): tr.flip_h = true
	if n.get("flipY", false): tr.flip_v = true
	_place_overlay(tr, n)
	if n.has("scaleX") or n.has("scaleY"):
		tr.scale = Vector2(float(n.get("scaleX", 1)), float(n.get("scaleY", 1)))
	_register_overlay(str(n.get("id", "")), tr, n)

func _show_overlay_text(n: Dictionary) -> void:
	var lbl := Label.new()
	lbl.text = str(n.get("text", ""))
	lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lbl.autowrap_mode = TextServer.AUTOWRAP_OFF
	lbl.horizontal_alignment = _halign(n.get("align", "left"))
	lbl.vertical_alignment = _valign(n.get("valign", "top"))
	_apply_overlay_font(lbl, n)
	_place_overlay(lbl, n)
	_register_overlay(str(n.get("id", "")), lbl, n)

func _show_overlay_button(n: Dictionary) -> void:
	# Hidden if its showIf conditions fail (a conditionally-appearing button).
	if n.has("showIf") and state != null and not state.eval_conditions(n.get("showIf")):
		return
	var b := Button.new()
	b.text = str(n.get("text", ""))
	b.clip_text = true
	b.alignment = _halign(n.get("align", "center"))
	var img := loader.load_texture(n.get("image"))
	if img != null:
		var sb := StyleBoxTexture.new()
		sb.texture = img
		b.add_theme_stylebox_override("normal", sb)
		var hov := loader.load_texture(n.get("hoverImage"))
		var sbh := StyleBoxTexture.new()
		sbh.texture = hov if hov != null else img
		b.add_theme_stylebox_override("hover", sbh)
		b.add_theme_stylebox_override("pressed", sbh)
		b.add_theme_stylebox_override("focus", sbh)
	elif n.has("backgroundColor") or n.has("borderRadius"):
		var br := int(n.get("borderRadius", 6))
		b.add_theme_stylebox_override("normal", _flat_box(_to_color(n.get("backgroundColor", "#333333"), Color(0.2, 0.2, 0.2)), br))
		b.add_theme_stylebox_override("hover", _flat_box(_to_color(n.get("backgroundColor", "#444444"), Color(0.3, 0.3, 0.3)), br))
		b.add_theme_stylebox_override("focus", _flat_box(_to_color(n.get("backgroundColor", "#444444"), Color(0.3, 0.3, 0.3)), br))
	_apply_overlay_font(b, n)
	_place_overlay(b, n, 0.5)
	var actions: Array = n.get("actions", [])
	var click_sfx = n.get("clickSound")
	b.pressed.connect(func() -> void:
		if click_sfx != null: _play_sfx(click_sfx, 1.0)
		for a in actions: _dispatch_game_action(a))
	_register_overlay(str(n.get("id", "")), b, n)

func _show_overlay_hotspot(n: Dictionary) -> void:
	if n.has("showIf") and state != null and not state.eval_conditions(n.get("showIf")):
		return
	# A transparent (or highlighted) clickable region. Only click triggers are wired in v1.
	var area := Button.new()
	area.flat = true
	area.focus_mode = Control.FOCUS_NONE
	if n.get("visible", false) and n.has("highlightColor"):
		var box := StyleBoxFlat.new()
		box.bg_color = _to_color(n.get("highlightColor"), Color(1, 1, 0, 0.25))
		if str(n.get("shape", "rect")) == "circle":
			box.corner_radius_top_left = 9999; box.corner_radius_top_right = 9999
			box.corner_radius_bottom_left = 9999; box.corner_radius_bottom_right = 9999
		area.add_theme_stylebox_override("normal", box)
		area.add_theme_stylebox_override("hover", box)
		area.add_theme_stylebox_override("pressed", box)
	_place_overlay(area, n)
	var actions: Array = n.get("actions", [])
	var advance: bool = bool(n.get("advanceOnTrigger", false))
	area.pressed.connect(func() -> void:
		for a in actions: _dispatch_game_action(a)
		if advance and _awaiting == "say":
			_awaiting = ""
			interp.advance())
	_register_overlay(str(n.get("id", "")), area, n)

func _hide_overlay(id: String, transition) -> void:
	if id == "" or not _overlay_elements.has(id):
		return
	var node: Control = _overlay_elements[id]
	_overlay_elements.erase(id)
	var dur := _transition_secs(transition, 0.0) if transition is Dictionary else 0.0
	if dur > 0.0:
		var tw := create_tween()
		tw.tween_property(node, "modulate:a", 0.0, dur)
		tw.tween_callback(node.queue_free)
	else:
		node.queue_free()

# Animate a tracked overlay element (or the character) toward the target properties.
func _tween_element(n: Dictionary) -> void:
	var target := str(n.get("target", ""))
	var node: Control = null
	if str(n.get("targetType", "")) == "character":
		node = _characters.get(target)   # tween the specific character by id
	elif _overlay_elements.has(target):
		node = _overlay_elements[target]
	if node == null:
		return
	var dur := maxf(0.0, float(n.get("durationMs", 500)) / 1000.0)
	var vp := get_viewport_rect().size
	var tw := create_tween().set_parallel(true)
	if n.has("x"): tw.tween_property(node, "position:x", float(n.get("x")) / 100.0 * vp.x, dur)
	if n.has("y"): tw.tween_property(node, "position:y", float(n.get("y")) / 100.0 * vp.y, dur)
	if n.has("opacity"): tw.tween_property(node, "modulate:a", clampf(float(n.get("opacity")), 0.0, 1.0), dur)
	if n.has("rotation"): tw.tween_property(node, "rotation_degrees", float(n.get("rotation")), dur)
	if n.has("scale"): tw.tween_property(node, "scale", Vector2(float(n.get("scale")), float(n.get("scale"))), dur)
	elif n.has("scaleX") or n.has("scaleY"): tw.tween_property(node, "scale", Vector2(float(n.get("scaleX", 1)), float(n.get("scaleY", 1))), dur)
	if n.has("width") and n.has("height"): tw.tween_property(node, "size", Vector2(float(n.get("width")) / 100.0 * vp.x, float(n.get("height")) / 100.0 * vp.y), dur)

# Dispatch an in-game button / hotspot / hotkey action (a normalized {action, ...} verb).
func _dispatch_game_action(a: Dictionary) -> void:
	match a.get("action"):
		"setVar":
			if state: state.set_var_op(a.get("var"), a.get("op", "set"), a.get("value"))
		"resetVar":
			if state and state.var_defs.has(a.get("var")):
				state.vars[a.get("var")] = state.var_defs[a.get("var")].get("default")
		"playSound": _play_sfx(a.get("audio"), 1.0)
		"jumpToScene": interp.jump_to_scene(a.get("scene"))
		"jumpToLabel": interp.jump_to_label(a.get("label"))
		"showElement": _reveal_element(str(a.get("target", "")), true)
		"hideElement": _reveal_element(str(a.get("target", "")), false)
		"goToScreen", "toggleScreen": _toggle_screen(str(a.get("screen", "")))
		"returnToGame": _hide_screen()
		"openUrl": if a.get("url"): OS.shell_open(str(a.get("url")))
		"startNewGame": _start_new_game()
		"quitToTitle": _quit_to_title()
		"callCommonEvent": _run_common_event(a.get("event"))
		"showLog": _toggle_backlog()
		"toggleAuto": _set_auto(not _auto)
		"toggleSkip": _set_skip(not _skipping)
		"skipBackward":
			if _awaiting == "say": _awaiting = ""; interp.skip_backward()
		_: pass

# Show/Hide a UI element by id: a live scene-overlay element toggles visibility; a startHidden screen
# element is revealed/hidden by rebuilding the screen + HUD with the updated reveal set.
func _reveal_element(id: String, show: bool) -> void:
	if id == "":
		return
	if _overlay_elements.has(id):
		_overlay_elements[id].visible = show
		return
	if show: _shown_elements[id] = true
	else: _shown_elements.erase(id)
	if screen_view.visible and _current_screen != "" and loader.ui_screens.has(_current_screen):
		screen_view.build(loader.ui_screens[_current_screen], loader, _settings, state, _shown_elements)
	if _hud_active:
		_refresh_hud()

func _run_common_event(id) -> void:
	if id != null and interp != null:
		interp.run_common_event(id)

# Toggle a screen open/closed (per-screen open hotkey + ToggleScreen action).
func _toggle_screen(id: String) -> void:
	if id == "" or not loader.ui_screens.has(id):
		return
	if screen_view.visible and _current_screen == id:
		_hide_screen()
	else:
		_show_screen(id)

# Play a dialogue line's voice clip; returns its length in seconds (for voice-paced text), 0 if none.
func _play_voice(ref) -> float:
	voice_player.stop()
	var path := loader.asset_path(ref)
	if path == "" or not FileAccess.file_exists(path):
		return 0.0
	var stream: AudioStream = null
	var ext := path.get_extension().to_lower()
	if ext == "ogg":
		stream = AudioStreamOggVorbis.load_from_file(path)
	elif ext == "mp3":
		var mp3 := AudioStreamMP3.new()
		mp3.data = FileAccess.get_file_as_bytes(path)
		stream = mp3
	if stream != null:
		voice_player.stream = stream
		voice_player.play()
		return stream.get_length()
	return 0.0

func _play_sfx(ref, volume) -> void:
	var path := loader.asset_path(ref)
	if path == "" or not FileAccess.file_exists(path):
		return
	var stream: AudioStream = null
	var ext := path.get_extension().to_lower()
	if ext == "ogg":
		stream = AudioStreamOggVorbis.load_from_file(path)
	elif ext == "mp3":
		var mp3 := AudioStreamMP3.new()
		mp3.data = FileAccess.get_file_as_bytes(path)
		stream = mp3
	if stream != null:
		sfx.stream = stream
		sfx.volume_db = linear_to_db(clampf(float(volume), 0.0, 1.0)) if volume != null else 0.0
		sfx.play()

func _apply_overlay_font(node: Control, n: Dictionary) -> void:
	var ff := loader.load_font(n.get("font")) if n.has("font") else null
	if ff != null:
		node.add_theme_font_override("font", ff)
	if n.has("fontSize"):
		node.add_theme_font_size_override("font_size", int(n.get("fontSize")))
	if n.has("color"):
		node.add_theme_color_override("font_color", _to_color(n.get("color"), Color.WHITE))
	var tb = n.get("textBorder")
	if tb is Dictionary:
		node.add_theme_color_override("font_outline_color", _to_color(tb.get("color", "#000000"), Color.BLACK))
		node.add_theme_constant_override("outline_size", int(maxf(1.0, float(tb.get("width", 1)) * 2.0)))
	var ts = n.get("textShadow")
	if ts is Dictionary:
		node.add_theme_color_override("font_shadow_color", _to_color(ts.get("color", "#000000"), Color.BLACK))
		node.add_theme_constant_override("shadow_offset_x", int(ts.get("x", 2)))
		node.add_theme_constant_override("shadow_offset_y", int(ts.get("y", 2)))

func _clear_overlay_elements() -> void:
	for id in _overlay_elements.keys():
		_overlay_elements[id].queue_free()
	_overlay_elements.clear()

# ── credit roll (a blocking, scrolling credits takeover) ──

func _start_credit_roll(node: Dictionary) -> void:
	_credit_on_complete = str(node.get("onComplete", "advance"))
	_credit_allow_skip = bool(node.get("allowSkip", true))
	var text_col := _to_color(node.get("textColor", "#ffffff"), Color.WHITE)
	_credit_overlay = Control.new()
	_credit_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_credit_overlay)  # above the scene; on top of everything for a clean takeover
	var bg := ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.color = _to_color(node.get("backgroundColor", "#000000"), Color.BLACK)
	_credit_overlay.add_child(bg)
	# optional slideshow backgrounds behind the text
	var bgs: Array = node.get("backgrounds", [])
	if not bgs.is_empty():
		var tex := loader.load_texture(bgs[0].get("image"))
		if tex != null:
			var tr := TextureRect.new()
			tr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
			tr.texture = tex
			tr.modulate.a = 0.5
			_credit_overlay.add_child(tr)
	var vp := get_viewport_rect().size
	# foreground media (logos / art) positioned over the roll (static in v1)
	for m in node.get("media", []):
		if not (m is Dictionary): continue
		var mt := loader.load_texture(m.get("image"))
		if mt == null: continue
		var mr := TextureRect.new()
		mr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		mr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		mr.texture = mt
		mr.position = Vector2(float(m.get("x", 0)) / 100.0 * vp.x, float(m.get("y", 0)) / 100.0 * vp.y)
		mr.size = Vector2(float(m.get("width", 20)) / 100.0 * vp.x, float(m.get("height", 20)) / 100.0 * vp.y)
		mr.modulate.a = clampf(float(m.get("opacity", 1)), 0.0, 1.0)
		_credit_overlay.add_child(mr)
	var scroller := VBoxContainer.new()
	scroller.alignment = BoxContainer.ALIGNMENT_CENTER
	scroller.add_theme_constant_override("separation", 14)
	scroller.position = Vector2(0, vp.y)
	scroller.custom_minimum_size = Vector2(vp.x, 0)
	scroller.size = Vector2(vp.x, 0)
	for e in node.get("entries", []):
		if not (e is Dictionary): continue
		if str(e.get("kind", "credit")) == "heading":
			scroller.add_child(_credit_label(str(e.get("label", "")), 44, true, text_col))
		else:
			scroller.add_child(_credit_label(str(e.get("label", "")), 24, false, Color(text_col.r, text_col.g, text_col.b, 0.75)))
			if str(e.get("value", "")) != "":
				scroller.add_child(_credit_label(str(e.get("value", "")), 32, true, text_col))
	_credit_overlay.add_child(scroller)
	_run_credit_scroll(scroller, maxf(1.0, float(node.get("durationMs", 15000)) / 1000.0), float(node.get("scrollSpeed", 0)))

func _credit_label(txt: String, size: int, bold: bool, col: Color) -> Label:
	var l := Label.new()
	l.text = txt
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	return l

func _run_credit_scroll(scroller: VBoxContainer, dur: float, speed: float) -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	if _credit_overlay == null: return  # skipped before layout
	var vp := get_viewport_rect().size
	var h := scroller.size.y
	var dist := vp.y + h
	var secs := (dist / speed) if speed > 0.0 else dur
	var tw := create_tween()
	tw.tween_property(scroller, "position:y", -h, secs)
	tw.tween_callback(_finish_credits)

func _finish_credits() -> void:
	if _credit_overlay != null:
		_credit_overlay.queue_free()
		_credit_overlay = null
	if _awaiting != "credits":
		return
	_awaiting = ""
	if _credit_on_complete == "title" and loader.title_screen != "":
		_show_screen(loader.title_screen)
	else:
		interp.advance()

func _weather_color(etype: String, col_s) -> Color:
	if col_s is String and col_s != "" and Color.html_is_valid(col_s):
		return Color.html(col_s)
	match etype:
		"haze": return Color(0.90, 0.86, 0.78)
		"smoke": return Color(0.27, 0.27, 0.29)
		_: return Color(0.80, 0.82, 0.85)  # fog

func _rain_cfg(intensity: float) -> Dictionary:
	return { "shape": "circle", "colors": ["rgba(180,205,255,0.55)"], "emitRate": 220.0 * intensity, "lifetime": 1.0, "speedMin": 500, "speedMax": 760, "sizeMin": 1, "sizeMax": 2, "gravity": 0, "wind": -30, "directionMin": 94, "directionMax": 100, "emitterX": 50, "emitterY": -5, "emitterWidth": 150, "emitterHeight": 3, "fadeOut": false, "shrink": false, "opacity": 1, "blendMode": "source-over" }

func _snow_cfg(intensity: float, variant: String) -> Dictionary:
	var col := "rgba(120,120,120,0.7)" if variant == "ash" else "rgba(255,255,255,0.9)"
	return { "shape": "circle", "colors": [col], "emitRate": 50.0 * intensity, "lifetime": 7.0, "speedMin": 15, "speedMax": 45, "sizeMin": 2, "sizeMax": 5, "gravity": 5, "wind": 12, "directionMin": 80, "directionMax": 100, "emitterX": 50, "emitterY": -5, "emitterWidth": 150, "emitterHeight": 3, "fadeOut": false, "shrink": false, "opacity": 0.9, "blendMode": "source-over" }

func _lightning(p: Dictionary) -> void:
	var c := _fx_color(p, "color", Color(0.92, 0.95, 1.0))
	var intensity := clampf(float(p.get("intensity", 0.9)), 0.0, 1.0)
	var flashes := clampi(int(p.get("flashes", 2)), 1, 3)
	var each := maxf(0.3, float(p.get("duration", 0.7))) / float(flashes)
	var tw := create_tween()
	for i in flashes:
		tw.tween_callback(func() -> void: flash_layer.color = Color(c.r, c.g, c.b, intensity))
		tw.tween_property(flash_layer, "color:a", 0.0, each * 0.6)
		tw.tween_interval(each * 0.4)

func _flashlight(p: Dictionary) -> void:
	if not bool(p.get("enabled", true)):
		flashlight_rect.visible = false
		_flashlight_on = false
		return
	var mat := flashlight_rect.material as ShaderMaterial
	var view := get_viewport_rect().size
	mat.set_shader_parameter("radius", clampf(float(p.get("radius", 22)) / 100.0, 0.02, 1.0))
	mat.set_shader_parameter("softness", clampf(float(p.get("softness", 0.6)), 0.0, 1.0))
	mat.set_shader_parameter("darkness", clampf(float(p.get("darkness", 0.85)), 0.0, 1.0))
	mat.set_shader_parameter("dark_color", _fx_color(p, "color", Color.BLACK))
	mat.set_shader_parameter("aspect", Vector2(view.x / view.y, 1.0))
	mat.set_shader_parameter("light_pos", Vector2(0.5, 0.5))
	flashlight_rect.visible = true
	_flashlight_on = true

# ── input ──

func _clear_choices() -> void:
	for c in choices_box.get_children():
		c.queue_free()

func _pick(index: int) -> void:
	if _awaiting != "choices": return
	_awaiting = ""
	interp.pick(index)

func _on_text_submitted(txt: String) -> void:
	if _awaiting != "text_input": return
	_awaiting = ""
	interp.submit_text(txt)

func _unhandled_input(event: InputEvent) -> void:
	# Credit roll owns input while active: an accept press skips it (if allowed).
	if _credit_overlay != null:
		var skip: bool = event.is_action_pressed("ui_accept") or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT)
		if skip and _credit_allow_skip:
			_finish_credits()
		return
	# Backlog (history log) owns input while open: H / Escape / click closes it.
	if _backlog_overlay != null:
		if event is InputEventKey and event.pressed and not event.echo and (event.keycode == KEY_ESCAPE or event.keycode == KEY_H):
			_toggle_backlog()
		elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			_toggle_backlog()
		return
	# Keyboard shortcuts first, so per-screen open hotkeys work even while a screen is open (to close it),
	# and Escape opens/closes the pause screen. Text input has focus and consumes keys itself.
	if event is InputEventKey and event.pressed and not event.echo and _awaiting != "text_input":
		# H = history/backlog, Ctrl = toggle skip, ArrowUp/PageUp = skip-backward (standard VN shortcuts).
		if event.keycode == KEY_H and not screen_view.visible:
			_toggle_backlog()
			return
		if (event.keycode == KEY_CTRL) and not screen_view.visible:
			_set_skip(not _skipping)
			return
		if (event.keycode == KEY_UP or event.keycode == KEY_PAGEUP) and not screen_view.visible and _awaiting == "say":
			_awaiting = ""
			_set_skip(false)
			interp.skip_backward()
			return
		if event.keycode == KEY_ESCAPE:
			var pause := str(loader.ui.get("pauseScreen", "")) if loader.ui != null else ""
			if screen_view.visible:
				if _current_screen == pause: _hide_screen()  # Escape closes the pause menu
				return
			elif pause != "":
				_show_screen(pause)
				return
		# Per-screen open hotkey (e.g. 'I' for inventory, 'M' for map) — toggles the matching screen.
		var ch := char(event.unicode).to_lower() if event.unicode > 0 else ""
		if ch != "":
			for sid in loader.ui_screens:
				if str(loader.ui_screens[sid].get("openHotkey", "")) == ch:
					_toggle_screen(sid)
					return
	# A normal screen owns input; a passThrough HUD lets the story keep receiving it.
	if screen_view.visible and not _current_passthrough: return
	var accept: bool = event.is_action_pressed("ui_accept") or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT)
	if _awaiting == "say" and accept:
		if _revealing:
			# first press finishes the typewriter (standard VN behavior); next press advances
			text_label.visible_characters = -1
			_revealing = false
		elif not _line_time_locked:
			# a locked timed line ignores clicks — only its timer advances it
			_awaiting = ""
			interp.advance()
	elif _awaiting == "finished" and event.is_action_pressed("ui_accept"):
		get_tree().quit()

# ── screenshot self-check (--shot): advance a few beats, grab a frame, quit ──

func _run_shot_sequence() -> void:
	await get_tree().process_frame
	# If the game opened on a title/menu screen, capture that (this is the screens feature).
	if screen_view.visible:
		await get_tree().create_timer(0.6).timeout
		get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path("res://") + "shot.png")
		print("[shot] saved title screen")
		# verify the "New Game" action actually starts the story
		_on_screen_action({ "action": "startNewGame" })
		await get_tree().create_timer(0.6).timeout
		print("[shot] after New Game: screen_hidden=", not screen_view.visible, " story_state=", _awaiting)
		# exercise the save-slot grid: save to slot 1, show the Load screen, capture, then load it back
		interp.save_to_slot(1)
		var ls := str(loader.ui.get("loadScreen", ""))
		if ls != "" and loader.ui_screens.has(ls):
			_show_screen(ls)
			await get_tree().create_timer(0.6).timeout
			get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path("res://") + "shot_load.png")
			print("[shot] saved load screen")
			_on_screen_action({ "action": "loadFromSlot", "slot": 1 })
			await get_tree().create_timer(0.6).timeout
			print("[shot] after load slot 1: screen_hidden=", not screen_view.visible, " story_state=", _awaiting)
		get_tree().quit(0)
		return
	# advance a few beats to reach a character line (shows the name plate + sprite over a background)
	for i in 8:
		if _awaiting == "say" and _characters.is_empty(): interp.advance()
		else: break
		await get_tree().create_timer(0.2).timeout
	# prove the typewriter is mid-reveal, then complete it for a clean frame
	await get_tree().create_timer(0.35).timeout
	print("[shot] typewriter mid-reveal: visible_chars=", text_label.visible_characters, "/", _full_text.length(), " revealing=", _revealing)
	text_label.visible_characters = -1
	_revealing = false
	await get_tree().create_timer(0.4).timeout
	var img := get_viewport().get_texture().get_image()
	var out := ProjectSettings.globalize_path("res://") + "shot.png"
	img.save_png(out)
	print("[shot] saved ", out)
	get_tree().quit(0)

# Drive the story until particles spawn, then screenshot (proves SpawnParticles renders).
func _run_particle_shot() -> void:
	await get_tree().process_frame
	if screen_view.visible:
		_on_screen_action({ "action": "startNewGame" })
	await get_tree().create_timer(0.4).timeout
	for i in 100:
		if particle_fx.get_child_count() > 0: break
		if _awaiting == "say":
			if _revealing:
				text_label.visible_characters = -1
				_revealing = false
			else:
				interp.advance()
		elif _awaiting == "choices":
			interp.pick(0)
		elif _awaiting == "text_input":
			interp.submit_text("Test")
		else:
			break
		await get_tree().create_timer(0.1).timeout
	await get_tree().create_timer(1.2).timeout  # let particles fill the screen
	get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path("res://") + "shot.png")
	print("[shot] particle emitters=", particle_fx.get_child_count(), " (>0 = particles active)")
	get_tree().quit(0)

# Screenshot the current state after a moment (no advancing) — for FX applied before the first pause.
func _run_now_shot() -> void:
	await get_tree().process_frame
	await get_tree().create_timer(1.2).timeout
	get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path("res://") + "shot.png")
	print("[shot] now: stage_scale=", stage.scale.x, " tint_a=", tint_layer.color.a, " awaiting=", _awaiting)
	print("[shot] overlays: weather_emitters=", overlay_fx.get_child_count(), " rects=", _overlay_rects.keys())
	# advance once to fire any post-pause FX (shake/flash) and confirm no crash
	if _awaiting == "say":
		if _revealing: _revealing = false
		interp.advance()
	await get_tree().create_timer(0.3).timeout
	print("[shot] after advance: shake_active=", _shake_time > 0.0)
	get_tree().quit(0)

# ── in-game controls: skip / auto-advance / backlog / quick menu ──

# Wrap dialogue text in Godot's built-in RichTextLabel bbcode effects for the author's textEffect.
# The typewriter still reveals by visible_characters (bbcode tags aren't counted).
func _apply_text_effect(text: String, effects: Array) -> String:
	if effects.is_empty() or not (effects[0] is Dictionary):
		return text
	var e := str(effects[0].get("effect", "none"))
	var p: Dictionary = effects[0].get("params", {})
	var spd := float(p.get("speed", 1)) if p.get("speed") != null else 1.0
	var amp := float(p.get("intensity", 1)) if p.get("intensity") != null else 1.0
	match e:
		"shake": return "[shake rate=%.1f level=%d]%s[/shake]" % [20.0 * spd, int(6 * amp), text]
		"glitch": return "[shake rate=%.1f level=%d]%s[/shake]" % [40.0 * spd, int(10 * amp), text]
		"wave", "bounce", "typewriter-bounce": return "[wave amp=%d freq=%.1f]%s[/wave]" % [int(30 * amp), 5.0 * spd, text]
		"rainbow": return "[rainbow freq=%.1f sat=0.8 val=1.0]%s[/rainbow]" % [spd, text]
		"pulse": return "[pulse freq=%.1f color=#ffffff88]%s[/pulse]" % [spd, text]
		"fade-in": return "[fade start=0 length=%d]%s[/fade]" % [max(4, text.length()), text]
		_: return text

func _set_skip(on: bool) -> void:
	_skipping = on
	_skip_accum = 0.0

# Countdown bar across the top of the dialogue box while a per-line timer runs (showTimer).
func _set_timer_bar(show: bool) -> void:
	if show:
		if _timer_bar == null:
			_timer_bar = ProgressBar.new()
			_timer_bar.min_value = 0.0
			_timer_bar.max_value = 1.0
			_timer_bar.show_percentage = false
			_timer_bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
			_timer_bar.offset_left = 10
			_timer_bar.offset_right = -10
			_timer_bar.offset_top = 4
			_timer_bar.custom_minimum_size = Vector2(0, 6)
			panel.add_child(_timer_bar)
		_timer_bar.value = 1.0
		_timer_bar.visible = true
	elif _timer_bar != null:
		_timer_bar.visible = false

func _set_auto(on: bool) -> void:
	_auto = on
	_auto_accum = 0.0

# Backlog / history: a dimmed scrollable list of every dialogue line seen (H or the Log button).
func _toggle_backlog() -> void:
	if _backlog_overlay != null:
		_backlog_overlay.queue_free()
		_backlog_overlay = null
		return
	_backlog_overlay = ColorRect.new()
	_backlog_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_backlog_overlay.color = Color(0, 0, 0, 0.88)
	add_child(_backlog_overlay)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.offset_left = 80
	scroll.offset_right = -80
	scroll.offset_top = 50
	scroll.offset_bottom = -50
	_backlog_overlay.add_child(scroll)
	var vb := VBoxContainer.new()
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vb.add_theme_constant_override("separation", 12)
	scroll.add_child(vb)
	var title := Label.new()
	title.text = "— Log —"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 28)
	vb.add_child(title)
	var wrap_w := get_viewport_rect().size.x - 200.0
	for entry in _backlog:
		var row := Label.new()
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.custom_minimum_size = Vector2(wrap_w, 0)
		var nm := str(entry.get("name", ""))
		row.text = (nm + ":  " if nm != "" else "") + str(entry.get("text", ""))
		vb.add_child(row)

# Build the in-game quick menu (Log / Auto / Skip / Save / Load) from ui.quickMenu.
func _build_quick_menu() -> void:
	if _quick_menu != null:
		_quick_menu.queue_free()
		_quick_menu = null
	var qm: Dictionary = loader.ui.get("quickMenu", {}) if loader.ui != null else {}
	if str(qm.get("position", "")) == "hidden":
		return
	var items := []
	if qm.get("showLog", true): items.append(["Log", "log"])
	if qm.get("showAutoAdvance", true): items.append(["Auto", "auto"])
	if qm.get("showSkipForward", true): items.append(["Skip", "skip"])
	if qm.get("showSave", true): items.append(["Save", "save"])
	if qm.get("showLoad", true): items.append(["Load", "load"])
	if items.is_empty():
		return
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 6)
	var col := _to_color(qm.get("color"), Color(0, 0, 0, 0.45))
	var radius := int(qm.get("borderRadius", 6))
	for it in items:
		var b := Button.new()
		b.text = it[0]
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_stylebox_override("normal", _flat_box(col, radius))
		b.add_theme_stylebox_override("hover", _flat_box(Color(col.r, col.g, col.b, minf(1.0, col.a + 0.2)), radius))
		var act: String = it[1]
		b.pressed.connect(func() -> void: _quick_menu_action(act))
		hb.add_child(b)
	_quick_menu = hb
	add_child(_quick_menu)
	_quick_menu.visible = false
	var pos := str(qm.get("position", "bottom-right"))
	call_deferred("_place_quick_menu", pos)

func _place_quick_menu(pos: String) -> void:
	if _quick_menu == null:
		return
	var vp := get_viewport_rect().size
	var sz := _quick_menu.size
	var m := 16.0
	# explicit fine placement (quickMenuX/Y as %) overrides the corner preset
	var qm: Dictionary = loader.ui.get("quickMenu", {}) if loader.ui != null else {}
	if qm.has("x") and qm.has("y"):
		_quick_menu.position = Vector2(float(qm.get("x")) / 100.0 * vp.x, float(qm.get("y")) / 100.0 * vp.y)
		return
	match pos:
		"top-left": _quick_menu.position = Vector2(m, m)
		"top-right": _quick_menu.position = Vector2(vp.x - sz.x - m, m)
		"bottom-left": _quick_menu.position = Vector2(m, vp.y - sz.y - m)
		"above-dialogue": _quick_menu.position = Vector2(vp.x - sz.x - m, vp.y - sz.y - 210.0)
		_: _quick_menu.position = Vector2(vp.x - sz.x - m, vp.y - sz.y - m)

func _quick_menu_action(act: String) -> void:
	match act:
		"log": _toggle_backlog()
		"auto": _set_auto(not _auto)
		"skip": _set_skip(not _skipping)
		"save":
			var sv := str(loader.ui.get("saveScreen", "")) if loader.ui != null else ""
			if sv != "": _show_screen(sv)
		"load":
			var ld := str(loader.ui.get("loadScreen", "")) if loader.ui != null else ""
			if ld != "": _show_screen(ld)

# ── reactive / dynamic UI: per-line textbox theme + condition-gated restyle + reveal highlight ──

# Apply the effective textbox style (base ← per-line theme ← first matching reactive state) each line.
func _apply_reactive_ui(ev: Dictionary) -> void:
	var ui: Dictionary = loader.ui if loader.ui != null else {}
	# ---- textbox: merge base + theme + reactive ----
	var db: Dictionary = ui.get("dialogueBox", {})
	var s := {}
	for k in ["image", "color", "opacity", "borderRadius", "textFont", "nameFont"]:
		if db.has(k): s[k] = db[k]
	var nb: Dictionary = ui.get("namebox", {})
	if nb.has("image"): s["nameImage"] = nb["image"]
	if nb.has("color"): s["nameColor"] = nb["color"]
	var themes: Dictionary = ui.get("textboxThemes", {})
	var tid = ev.get("textboxTheme")
	if tid != null and themes.has(tid): _merge_style(s, themes[tid])
	var hide_name := false
	for st in ui.get("reactiveTextbox", []):
		if st is Dictionary and st.has("if") and state != null and state.eval_conditions(st.get("if")):
			_merge_style(s, st)
			hide_name = bool(st.get("hideNamebox", false))
			break
	_apply_textbox_style(s, hide_name)
	# ---- reveal highlight ----
	var rh: Dictionary = ui.get("revealHighlight", {})
	if rh.get("enabled", false) and _revealing:
		_hl_base_color = text_label.get_theme_color("default_color")
		var hc := _to_color(rh.get("color"), Color(1, 0.9, 0.3))
		if rh.get("useSpeakerColor", false):
			var ch: Dictionary = loader.characters.get(ev.get("speaker"), {})
			if ch.has("nameColor"): hc = _to_color(ch.get("nameColor"), hc)
		text_label.add_theme_color_override("default_color", hc)
		_hl_pending = true
	# ---- reactive quick menu ----
	if _quick_menu != null:
		var qm_hidden := false
		for st in ui.get("reactiveQuickMenu", []):
			if st is Dictionary and st.has("if") and state != null and state.eval_conditions(st.get("if")):
				qm_hidden = bool(st.get("hide", false))
				if st.has("color"):
					var c := _to_color(st.get("color"), Color(0, 0, 0, 0.45))
					if st.has("opacity"): c.a = float(st.get("opacity"))
					for b in _quick_menu.get_children():
						b.add_theme_stylebox_override("normal", _flat_box(c, 6))
				break
		_quick_menu_forced_hidden = qm_hidden

# Restyle the dialogue panel + name plate from a merged textbox style dict.
func _apply_textbox_style(s: Dictionary, hide_name: bool) -> void:
	var box := _chrome_stylebox(s, Color(0.05, 0.05, 0.08, 0.85))
	if box != null:
		panel.add_theme_stylebox_override("panel", box)
	if s.has("textFont"):
		_apply_chrome_font(text_label, s.get("textFont"), true)
	if s.has("nameFont"):
		_apply_chrome_font(name_label, s.get("nameFont"), false)
	if s.has("nameColor") or s.has("nameImage") or s.has("nameRadius"):
		var nstyle := { "image": s.get("nameImage"), "color": s.get("nameColor"), "opacity": s.get("nameOpacity"), "borderRadius": s.get("nameRadius") }
		var nbox := _chrome_stylebox(nstyle, Color(0, 0, 0, 0))
		if nbox != null: name_label.add_theme_stylebox_override("normal", nbox)
	if hide_name:
		name_label.visible = false

# Overlay defined keys of `src` onto `dst` (later layers win).
func _merge_style(dst: Dictionary, src: Dictionary) -> void:
	for k in src.keys():
		if k != "if" and k != "hideNamebox" and src[k] != null:
			dst[k] = src[k]

# VNParticleFx — renders resolved particle configs (from SpawnParticles). One CPUParticles2D per color
# (CPUParticles2D can't randomize color per-particle), grouped under a node named by the particle tag so
# StopParticles can free it. Emitter x/y/w/h are % of the view; direction degrees (0°=right, 90°=down);
# speeds px/s; gravity/wind px/s².
class_name VNParticleFx
extends Node2D

var _view := Vector2(1280, 720)

func set_view_size(s: Vector2) -> void:
	_view = s

func clear() -> void:
	for c in get_children():
		c.queue_free()

func stop(tag: String) -> void:
	var n := get_node_or_null(NodePath("p_" + tag))
	if n:
		n.queue_free()

func spawn(tag: String, cfg: Dictionary) -> void:
	stop(tag)
	var holder := Node2D.new()
	holder.name = "p_" + tag
	add_child(holder)

	var colors: Array = cfg.get("colors", ["#ffffff"])
	if colors.is_empty():
		colors = ["#ffffff"]
	var lifetime := float(cfg.get("lifetime", 3))
	var per_color := int(maxf(1.0, round(float(cfg.get("emitRate", 10)) * lifetime / colors.size())))
	var tex := _shape_texture(str(cfg.get("shape", "circle")))

	var ew := float(cfg.get("emitterWidth", 100)) / 100.0 * _view.x
	var eh := float(cfg.get("emitterHeight", 100)) / 100.0 * _view.y
	var ex := float(cfg.get("emitterX", 50)) / 100.0 * _view.x
	var ey := float(cfg.get("emitterY", 50)) / 100.0 * _view.y

	var dmin := float(cfg.get("directionMin", 0))
	var dmax := float(cfg.get("directionMax", 360))
	var dmid := deg_to_rad((dmin + dmax) * 0.5)
	var dir := Vector2(cos(dmid), sin(dmid))
	var spread := clampf((dmax - dmin) * 0.5, 0.0, 180.0)
	var grav := Vector2(float(cfg.get("wind", 0)), float(cfg.get("gravity", 0)))
	var opacity := float(cfg.get("opacity", 1))
	var additive: bool = str(cfg.get("blendMode", "")) == "lighter"
	var fade := bool(cfg.get("fadeOut", true))
	var shrink := bool(cfg.get("shrink", false))
	var rot := float(cfg.get("rotationSpeed", 0))
	const BASE := 16.0

	for col_s in colors:
		var p := CPUParticles2D.new()
		p.position = Vector2(ex, ey)
		p.amount = per_color
		p.lifetime = lifetime
		p.texture = tex
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
		p.emission_rect_extents = Vector2(maxf(1.0, ew * 0.5), maxf(1.0, eh * 0.5))
		p.direction = dir
		p.spread = spread
		p.gravity = grav
		p.initial_velocity_min = float(cfg.get("speedMin", 20))
		p.initial_velocity_max = float(cfg.get("speedMax", 60))
		p.scale_amount_min = float(cfg.get("sizeMin", 3)) / BASE
		p.scale_amount_max = float(cfg.get("sizeMax", 8)) / BASE
		p.angular_velocity_min = rot
		p.angular_velocity_max = rot
		var c := _to_color(col_s)
		c.a *= opacity
		p.color = c
		if fade:
			var ramp := Gradient.new()
			ramp.set_color(0, Color(c.r, c.g, c.b, c.a))
			ramp.set_color(1, Color(c.r, c.g, c.b, 0.0))
			p.color_ramp = ramp
		if shrink:
			var sc := Curve.new()
			sc.add_point(Vector2(0, 1))
			sc.add_point(Vector2(1, 0))
			p.scale_amount_curve = sc
		if additive:
			var mat := CanvasItemMaterial.new()
			mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
			p.material = mat
		p.emitting = true
		holder.add_child(p)

func _shape_texture(shape: String) -> Texture2D:
	var s := 16
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	if shape == "square":
		for y in s:
			for x in s:
				img.set_pixel(x, y, Color.WHITE)
	else:
		var cx := s / 2.0
		var r := s / 2.0 - 1.0
		for y in s:
			for x in s:
				if Vector2(x - cx + 0.5, y - cx + 0.5).length() <= r:
					img.set_pixel(x, y, Color.WHITE)
	return ImageTexture.create_from_image(img)

func _to_color(v) -> Color:
	var s := str(v)
	if s.begins_with("rgb"):
		var inside := s.substr(s.find("(") + 1).trim_suffix(")")
		var parts := inside.split(",")
		var r := (parts[0].to_float() / 255.0) if parts.size() > 0 else 1.0
		var g := (parts[1].to_float() / 255.0) if parts.size() > 1 else 1.0
		var b := (parts[2].to_float() / 255.0) if parts.size() > 2 else 1.0
		var a := parts[3].to_float() if parts.size() > 3 else 1.0
		return Color(r, g, b, a)
	if Color.html_is_valid(s):
		return Color.html(s)
	return Color.WHITE

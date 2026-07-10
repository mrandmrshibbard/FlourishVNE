# One-off: (re)generate valid placeholder images for sample 01 so the runtime can load them.
# Run: Godot --headless --path runtime-godot --script res://tests/gen_assets.gd
extends SceneTree

func _initialize() -> void:
	var base := ProjectSettings.globalize_path("res://") + "../format/samples/01-hello-dialogue/assets/images/"
	_make(base + "bg_room.png", Color(0.14, 0.12, 0.22), 640, 360)
	_make(base + "yuki_neutral.png", Color(0.90, 0.52, 0.62), 220, 440)
	_make(base + "yuki_smile.png", Color(0.96, 0.72, 0.58), 220, 440)
	quit(0)

func _make(path: String, col: Color, w: int, h: int) -> void:
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(col)
	# a simple border so the sprite/bg reads as a shape in the screenshot
	for x in w:
		img.set_pixel(x, 0, Color.WHITE); img.set_pixel(x, h - 1, Color.WHITE)
	for y in h:
		img.set_pixel(0, y, Color.WHITE); img.set_pixel(w - 1, y, Color.WHITE)
	img.save_png(path)
	print("wrote ", path)

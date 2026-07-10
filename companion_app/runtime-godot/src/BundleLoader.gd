# BundleLoader — reads a .vnbundle (folder form) from any path and exposes its declarative data.
# Assets are loaded on demand from the bundle root (works with res://, user://, or an absolute OS
# path on desktop). No web assumptions: refs are relative paths, never data:/flourish-asset://.
class_name BundleLoader
extends RefCounted

const SUPPORTED_FORMAT := "0.1.0"

var root := ""
var manifest := {}
var entry_scene := ""
var scenes := {}          # id -> scene dict
var scene_order := []
var variables := []       # array of var-def dicts
var characters := {}      # id -> character dict
var common_events := {}   # id -> common-event dict
var ui := {}
var ui_screens := {}      # id -> screen dict
var title_screen := ""
var save_schema := {}
var errors := []
var warnings := []

func load_bundle(bundle_root: String) -> bool:
	root = bundle_root.rstrip("/")
	# If pointed at a .vnbundle ZIP FILE (not an extracted folder), unpack it to a temp dir first —
	# GDScript's FileAccess can't read inside a zip, so this is what caused "missing file: manifest.json".
	if FileAccess.file_exists(root) and not DirAccess.dir_exists_absolute(root):
		var extracted := _extract_zip(root)
		if extracted == "":
			errors.append("could not open bundle zip: " + root)
			return false
		root = extracted
	manifest = _read_json("manifest.json")
	if manifest.is_empty():
		errors.append("cannot read manifest.json at " + root + " — point at the extracted .vnbundle folder or a converted Godot project")
		return false
	var ver := str(manifest.get("bundle_format_version", ""))
	if ver != SUPPORTED_FORMAT:
		errors.append("unsupported bundle_format_version '%s' (runtime supports %s)" % [ver, SUPPORTED_FORMAT])
		return false
	for cap in ["scripts", "plugins", "miniGames", "phone", "inventory", "maps"]:
		if manifest.get("capabilities", {}).get(cap, false):
			warnings.append("bundle uses '%s' — not supported by this runtime yet" % cap)

	entry_scene = manifest.get("entry", {}).get("scene", "")
	var files = manifest.get("files", {})

	var scenes_doc = _read_json(files.get("scenes", "script/scenes.json"))
	for s in scenes_doc.get("scenes", []):
		scenes[s["id"]] = s
		scene_order.append(s["id"])

	if files.has("variables"):
		variables = _read_json(files["variables"]).get("variables", [])
	if files.has("characters"):
		for c in _read_json(files["characters"]).get("characters", []):
			characters[c["id"]] = c
	if files.has("logic"):
		for e in _read_json(files["logic"]).get("commonEvents", []):
			common_events[e["id"]] = e
	if files.has("ui"):
		ui = _read_json(files["ui"])
		for s in ui.get("screens", []):
			ui_screens[s["id"]] = s
		title_screen = ui.get("titleScreen", "")
	if files.has("save"):
		save_schema = _read_json(files["save"])

	if not scenes.has(entry_scene):
		errors.append("entry scene '%s' not found" % entry_scene)
		return false
	return true

# Unpack a .vnbundle zip to a temp folder under user:// and return its absolute path ("" on failure).
func _extract_zip(zip_path: String) -> String:
	var zr := ZIPReader.new()
	if zr.open(zip_path) != OK:
		return ""
	var dest := "user://_bundle"
	# clear any previous extraction
	if DirAccess.dir_exists_absolute(dest):
		OS.move_to_trash(ProjectSettings.globalize_path(dest))
	DirAccess.make_dir_recursive_absolute(dest)
	for f in zr.get_files():
		if f.ends_with("/"):
			continue
		var sub := f.get_base_dir()
		if sub != "":
			DirAccess.make_dir_recursive_absolute(dest + "/" + sub)
		var fa := FileAccess.open(dest + "/" + f, FileAccess.WRITE)
		if fa != null:
			fa.store_buffer(zr.read_file(f))
			fa.close()
	zr.close()
	return ProjectSettings.globalize_path(dest)

func _read_json(rel: String) -> Dictionary:
	var path := root + "/" + rel
	if not FileAccess.file_exists(path):
		errors.append("missing file: " + rel)
		return {}
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	if data == null:
		errors.append("bad JSON in: " + rel)
		return {}
	return data if data is Dictionary else {}

func asset_path(ref) -> String:
	return "" if (ref == null or ref == "") else root + "/" + str(ref)

func load_texture(ref) -> Texture2D:
	var p := asset_path(ref)
	if p == "": return null
	var img := Image.new()
	if img.load(p) != OK: return null
	return ImageTexture.create_from_image(img)

func load_font(ref) -> FontFile:
	var p := asset_path(ref)
	if p == "": return null
	var ff := FontFile.new()
	return ff if ff.load_dynamic_font(p) == OK else null

func character(id):
	return characters.get(id, {})

func character_name(id) -> String:
	return str(characters.get(id, {}).get("name", id))

func _find_sprite(id, sprite_id) -> Dictionary:
	var c = characters.get(id, {})
	var want = sprite_id if (sprite_id != null and sprite_id != "") else c.get("defaultSprite", "")
	for s in c.get("sprites", []):
		if s.get("id") == want: return s
	var arr = c.get("sprites", [])
	return arr[0] if arr.size() > 0 else {}

# Image paths for a sprite state, bottom-to-top. Supports single `image` OR a `layers` stack.
func character_sprite_layers(id, sprite_id) -> Array:
	var s = _find_sprite(id, sprite_id)
	if s.has("layers"): return s["layers"]
	if s.has("image") and s["image"] != "": return [s["image"]]
	return []

func character_sprite_ref(id, sprite_id) -> String:
	var layers := character_sprite_layers(id, sprite_id)
	return layers[0] if layers.size() > 0 else ""

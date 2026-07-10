# VNInterpreter — walks a scene's command list and drives playback. Control-flow nodes (set/jump/
# label/branch/callCommonEvent/group) are processed inline; presentation nodes (say/choice/textInput)
# PAUSE for player input; stage nodes (background/character/audio) apply and continue.
#
# Two ways to consume it:
#  - pull:   read `current_event` after start()/advance()/pick()/submit_text() (used by the tests)
#  - signal: connect `paused(event)` and `stage(event)` (used by the visual VNPlayer)
# A frame = { commands, index, scene }; a stack of frames handles branch/group/common-event descent.
class_name VNInterpreter
extends RefCounted

signal paused(event)   # event.kind = "say" | "choices" | "text_input" | "finished"
signal stage(event)    # non-blocking stage change (background/character/audio/etc.)

var loader: BundleLoader
var state: VNGameState
var current_scene := ""
var current_event := {}
var play_time := 0.0

var _frames := []
var _pending := []     # resolved (condition-filtered) choice options, with the raw option kept
var _history := []     # snapshots taken at each say pause, for skip-backward (rewind)
const HISTORY_MAX := 100
var _keep_choices := {}  # a keepOpenDuringChoices say passes its {text,name} to the following choice

func start(scene_id := "") -> void:
	var sid = scene_id if scene_id != "" else loader.entry_scene
	_history.clear()
	_goto_scene(sid, 0)
	_run()

# Skip-backward (ArrowUp): rewind to the previous dialogue line by restoring its snapshot.
func skip_backward() -> void:
	if _history.size() < 2:
		return
	_history.pop_back()               # drop the current line
	var snap = _history.pop_back()    # the previous line (re-pushed by _pause below)
	_frames.clear()
	for f in snap["frames"]:
		_frames.append({ "commands": f["commands"], "index": f["index"], "scene": f["scene"] })
	state.vars = (snap["vars"] as Dictionary).duplicate(true)
	current_scene = snap["scene"]
	_pause(snap["event"])

func _push_snapshot(event: Dictionary) -> void:
	var frames_copy := []
	for f in _frames:
		frames_copy.append({ "commands": f["commands"], "index": f["index"], "scene": f["scene"] })
	_history.append({ "frames": frames_copy, "vars": state.vars.duplicate(true), "scene": current_scene, "event": event })
	if _history.size() > HISTORY_MAX:
		_history.pop_front()

func advance() -> void:
	_run()

func pick(option_index: int) -> void:
	if option_index < 0 or option_index >= _pending.size(): return
	var opt = _pending[option_index]["raw"]
	for vs in opt.get("set", []):
		state.set_var_op(vs.get("var"), vs.get("op", "set"), vs.get("value"))
	var jumped := _run_actions(opt.get("actions", []))
	if not jumped:
		if opt.has("goto"): _goto_scene(opt["goto"], 0); jumped = true
		elif opt.has("gotoLabel"): _jump_to_label(opt["gotoLabel"]); jumped = true
	_run()

func submit_text(txt: String) -> void:
	if current_event.get("kind") == "text_input":
		state.vars[current_event.get("var")] = txt
	_run()

# In-game jumps fired by a button / hotspot action (not a choice). Restart the frame stack at the
# target and continue running.
func jump_to_scene(scene_id) -> void:
	if scene_id == null or str(scene_id) == "": return
	_goto_scene(scene_id, 0)
	_run()

func jump_to_label(label) -> void:
	if label == null or str(label) == "": return
	_jump_to_label(label)
	_run()

# Run a common event now (from a button/hotspot action): push its commands as a frame and continue.
func run_common_event(id) -> void:
	var ce = loader.common_events.get(id, {})
	if ce.is_empty(): return
	_frames.append({ "commands": ce.get("commands", []), "index": 0, "scene": current_scene })
	_run()

# ── internals ──

func _goto_scene(scene_id, index) -> void:
	current_scene = scene_id
	state.visited[scene_id] = true
	var sc = loader.scenes.get(scene_id, {})
	_frames = [{ "commands": sc.get("commands", []), "index": index, "scene": scene_id }]

func _top_index() -> int:
	return _frames[-1]["index"] if not _frames.is_empty() else 0

func _pause(event: Dictionary) -> void:
	if event.get("kind") == "say":
		_push_snapshot(event)   # record for skip-backward
	current_event = event
	emit_signal("paused", event)

func _run() -> void:
	while true:
		if _frames.is_empty():
			_pause({ "kind": "finished" }); return
		var f = _frames[-1]
		if f["index"] >= f["commands"].size():
			_frames.pop_back()
			continue
		var node = f["commands"][f["index"]]
		f["index"] += 1
		if node.has("if") and not state.eval_conditions(node["if"]):
			continue
		match node.get("type"):
			"say":
				if node.get("keepOpenDuringChoices", false):
					_keep_choices = { "text": state.interpolate(node.get("text", "")), "name": _display_name(node) }
				else:
					_keep_choices = {}
				_pause({ "kind": "say", "speaker": node.get("speaker"),
					"name": _display_name(node), "text": state.interpolate(node.get("text", "")),
					"textSpeed": node.get("textSpeed"), "timeLimit": node.get("timeLimit", 0),
					"timeLimitLocked": node.get("timeLimitLocked", false), "showTimer": node.get("showTimer", false),
					"effects": node.get("effects", []) })
				return
			"choice":
				_pending = _resolve_choice(node)
				var opts := []
				for o in _pending: opts.append({ "text": o["text"] })
				var cev := { "kind": "choices", "prompt": state.interpolate(node.get("prompt", "")), "options": opts }
				if not _keep_choices.is_empty():
					cev["keepText"] = _keep_choices.get("text")
					cev["keepName"] = _keep_choices.get("name")
				_keep_choices = {}
				_pause(cev)
				return
			"textInput":
				_pause({ "kind": "text_input", "var": node.get("var"),
					"prompt": state.interpolate(node.get("prompt", "")), "maxLength": node.get("maxLength", 0) })
				return
			"creditRoll":
				# Full-screen takeover that blocks until it finishes (then advances / returns to title).
				_pause({ "kind": "creditRoll", "node": node })
				return
			"set":
				state.set_var_op(node.get("var"), node.get("op", "set"), node.get("value"))
			"jump":
				_goto_scene(node.get("scene"), _label_index(node.get("scene"), node.get("atLabel", "")))
			"label":
				pass
			"jumpToLabel":
				_jump_to_label(node.get("label"))
			"branch":
				_enter_branch(node)
			"group":
				_frames.append({ "commands": node.get("commands", []), "index": 0, "scene": current_scene })
			"callCommonEvent":
				var ce = loader.common_events.get(node.get("event"), {})
				_frames.append({ "commands": ce.get("commands", []), "index": 0, "scene": current_scene })
			"wait":
				emit_signal("stage", { "kind": "wait", "node": node })  # visual layer honors ms; logic-only ignores
			"showCharacter", "hideCharacter", "setCharacterSprite", "moveCharacter", \
			"setBackground", "playMusic", "stopMusic", "playSound", "stopSound":
				emit_signal("stage", { "kind": node.get("type"), "node": node })
			_:
				emit_signal("stage", { "kind": node.get("type"), "node": node })  # Tier-2 presentation

func _resolve_choice(node) -> Array:
	var out := []
	for o in node.get("options", []):
		if o.has("if") and not state.eval_conditions(o["if"]): continue
		out.append({ "text": state.interpolate(o.get("text", "")), "raw": o })
	return out

func _run_actions(actions) -> bool:
	var jumped := false
	for a in actions:
		if a.has("if") and not state.eval_conditions(a["if"]): continue
		match a.get("action"):
			"setVar": state.set_var_op(a.get("var"), a.get("op", "set"), a.get("value"))
			"resetVar": state.vars[a.get("var")] = state.var_defs.get(a.get("var"), {}).get("default")
			"jumpToScene": _goto_scene(a.get("scene"), _label_index(a.get("scene"), a.get("atLabel", ""))); jumped = true
			"jumpToLabel": _jump_to_label(a.get("label")); jumped = true
			"save": save_to_slot(int(a.get("slot", 0)))
			"load": if load_from_slot(int(a.get("slot", 0))): jumped = true
			"deleteSave": _delete_slot(int(a.get("slot", 0)))
			"playMusic", "stopMusic", "playSound", "stopSound", "showScreen":
				emit_signal("stage", { "kind": a.get("action"), "action": a })
	return jumped

func _enter_branch(node) -> void:
	for arm in node.get("branches", []):
		if arm.get("else", false) or state.eval_conditions(arm.get("if")):
			_frames.append({ "commands": arm.get("commands", []), "index": 0, "scene": current_scene })
			return

func _jump_to_label(label) -> void:
	var cmds = loader.scenes.get(current_scene, {}).get("commands", [])
	for i in cmds.size():
		if cmds[i].get("type") == "label" and cmds[i].get("name") == label:
			_frames = [{ "commands": cmds, "index": i, "scene": current_scene }]
			return

func _label_index(scene_id, label) -> int:
	if label == null or label == "": return 0
	var cmds = loader.scenes.get(scene_id, {}).get("commands", [])
	for i in cmds.size():
		if cmds[i].get("type") == "label" and cmds[i].get("name") == label: return i
	return 0

func _display_name(node) -> String:
	if node.get("name", "") != "": return str(node["name"])
	var sp = node.get("speaker")
	return loader.character_name(sp) if (sp != null and sp != "") else ""

# ── native save/load (declared schema → user:// json; console runtime swaps in platform storage) ──

func _slot_path(slot: int) -> String:
	return "user://saves/slot_%d.json" % slot

func save_to_slot(slot: int) -> void:
	DirAccess.make_dir_recursive_absolute("user://saves")
	var f := FileAccess.open(_slot_path(slot), FileAccess.WRITE)
	if f == null: return
	var data := state.to_save(current_scene, _top_index(), play_time)
	data["sceneName"] = loader.scenes.get(current_scene, {}).get("name", current_scene)
	data["timestamp"] = Time.get_datetime_string_from_system(false, true)
	f.store_string(JSON.stringify(data))
	f.close()

# Resume playback after a load (or after a screen closes) — pauses at the current node.
func resume() -> void:
	_run()

# Save-slot metadata for the save/load UI (empty Dictionary = no save in that slot).
static func slot_info(slot: int) -> Dictionary:
	var path := "user://saves/slot_%d.json" % slot
	if not FileAccess.file_exists(path): return {}
	var d = JSON.parse_string(FileAccess.get_file_as_string(path))
	return d if d is Dictionary else {}

static func erase_slot(slot: int) -> void:
	var path := "user://saves/slot_%d.json" % slot
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func load_from_slot(slot: int) -> bool:
	var path := _slot_path(slot)
	if not FileAccess.file_exists(path): return false
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	if data == null: return false
	state.from_save(data)
	_goto_scene(data.get("scene"), int(data.get("index", 0)))
	return true

func _delete_slot(slot: int) -> void:
	var path := _slot_path(slot)
	if FileAccess.file_exists(path): DirAccess.remove_absolute(path)

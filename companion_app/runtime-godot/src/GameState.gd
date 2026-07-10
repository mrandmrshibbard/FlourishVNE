# VNGameState — variables + conditions + var-set ops + save snapshot.
# Pure data/logic (no rendering), so it's identically driven by the visual player and the headless
# tests. Implements the .vnbundle condition model (left-to-right, per-item and/or, no precedence).
class_name VNGameState
extends RefCounted

var vars := {}       # id -> value
var var_defs := {}   # id -> definition dict
var visited := {}    # sceneId -> true

func init_from(defs: Array) -> void:
	for d in defs:
		var_defs[d["id"]] = d
		vars[d["id"]] = d.get("default")

func _num(v) -> float:
	if v is bool: return 1.0 if v else 0.0
	if v is int or v is float: return float(v)
	if v is String and v.is_valid_float(): return v.to_float()
	return 0.0

func _clamp(id) -> void:
	var d = var_defs.get(id, {})
	if d.get("type") == "number":
		if d.has("min"): vars[id] = maxf(_num(vars[id]), _num(d["min"]))
		if d.has("max"): vars[id] = minf(_num(vars[id]), _num(d["max"]))

func set_var_op(id, op, value) -> void:
	if not vars.has(id): return
	match op:
		"set", "", null: vars[id] = value
		"add": vars[id] = _num(vars[id]) + _num(value)
		"subtract": vars[id] = _num(vars[id]) - _num(value)
		"multiply": vars[id] = _num(vars[id]) * _num(value)
		"divide": vars[id] = (_num(vars[id]) / _num(value)) if _num(value) != 0.0 else vars[id]
		"toggle": vars[id] = not bool(vars[id])
		_: vars[id] = value
	_clamp(id)

func _eq(a, b) -> bool:
	if (a is int or a is float) and (b is int or b is float): return _num(a) == _num(b)
	if a is bool or b is bool: return bool(a) == bool(b)
	return str(a) == str(b)

func _eval_one(c) -> bool:
	var v = vars.get(c.get("var"))
	var val = c.get("value")
	match c.get("op"):
		"==": return _eq(v, val)
		"!=": return not _eq(v, val)
		">": return _num(v) > _num(val)
		"<": return _num(v) < _num(val)
		">=": return _num(v) >= _num(val)
		"<=": return _num(v) <= _num(val)
		"is true": return bool(v) == true
		"is false": return bool(v) == false
		"contains": return str(v).find(str(val)) != -1
		"startsWith": return str(v).begins_with(str(val))
	return false

# Left-to-right, per-item join ('and'/'or'), no operator precedence — mirrors the engine.
func eval_conditions(conds) -> bool:
	if conds == null or not (conds is Array) or conds.size() == 0: return true
	var result := true
	for i in conds.size():
		var c = conds[i]
		var item := _eval_one(c)
		if i == 0:
			result = item
		elif c.get("join", "and") == "or":
			result = result or item
		else:
			result = result and item
	return result

# Replace {name} / {id} tokens in author text with current values.
func interpolate(text: String) -> String:
	if text == null: return ""
	var out := text
	for id in var_defs.keys():
		var d = var_defs[id]
		var val_s := _display_value(vars.get(id))
		out = out.replace("{" + str(d.get("name", id)) + "}", val_s)
		out = out.replace("{" + str(id) + "}", val_s)
	return out

func _display_value(v) -> String:
	if v is float and v == floor(v): return str(int(v))  # whole numbers without the .0
	return str(v)

func to_save(scene_id, index, play_time) -> Dictionary:
	return {
		"save_schema_version": "0.1.0",
		"scene": scene_id, "index": index,
		"vars": vars.duplicate(),
		"visited": visited.keys(),
		"playTime": play_time,
	}

func from_save(data: Dictionary) -> void:
	vars = (data.get("vars", {}) as Dictionary).duplicate()
	visited = {}
	for s in data.get("visited", []): visited[s] = true

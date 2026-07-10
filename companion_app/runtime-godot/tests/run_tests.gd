# Headless Phase-2 acceptance test: drives the interpreter over the three sample .vnbundles and
# asserts real playback — dialogue sequence, condition-gated choices, if/else branch, jumpToLabel,
# variable math, {var} interpolation, and a save/load round-trip.
# Run: Godot --headless --path runtime-godot --script res://tests/run_tests.gd
extends SceneTree

var _fails: Array = []

func _initialize() -> void:
	var samples := ProjectSettings.globalize_path("res://") + "../format/samples"
	# clean save slots so save/load assertions are deterministic
	for s in [0, 1, 2, 3]:
		var p := "user://saves/slot_%d.json" % s
		if FileAccess.file_exists(p): DirAccess.remove_absolute(p)

	test_hello(samples + "/01-hello-dialogue")
	test_branching(samples + "/02-branching-variables")
	test_saveload(samples + "/03-save-load")

	print("")
	if _fails.is_empty():
		print("RESULT: Phase-2 runtime plays all sample bundles ✅")
		quit(0)
	else:
		print("RESULT: FAIL — %d assertion(s):" % _fails.size())
		for f in _fails: print("   ✗ ", f)
		quit(1)

# ── helpers ──

func check(cond: bool, msg: String) -> void:
	if not cond: _fails.append(msg)

func make_interp(dir: String):
	var loader := BundleLoader.new()
	if not loader.load_bundle(dir):
		_fails.append("loader failed for %s: %s" % [dir, str(loader.errors)])
		return null
	var st := VNGameState.new()
	st.init_from(loader.variables)
	var it := VNInterpreter.new()
	it.loader = loader
	it.state = st
	return it

func drive(it, choices: Array = [], texts: Array = [], max_steps: int = 300) -> Array:
	var transcript: Array = []
	var ci := 0
	var ti := 0
	it.start()
	var steps := 0
	while it.current_event.get("kind") != "finished" and steps < max_steps:
		steps += 1
		var ev = it.current_event
		transcript.append(ev.duplicate(true))
		match ev.get("kind"):
			"say": it.advance()
			"choices":
				var pi = choices[ci] if ci < choices.size() else 0
				ci += 1
				it.pick(pi)
			"text_input":
				var t = texts[ti] if ti < texts.size() else ""
				ti += 1
				it.submit_text(t)
			_: it.advance()
	transcript.append({ "kind": "finished" })
	return transcript

func has_say(t: Array, text: String) -> bool:
	for e in t:
		if e.get("kind") == "say" and e.get("text") == text: return true
	return false

func says(t: Array) -> Array:
	var out: Array = []
	for e in t:
		if e.get("kind") == "say": out.append(e)
	return out

# ── tests ──

func test_hello(dir: String) -> void:
	var it = make_interp(dir)
	if it == null: return
	var t := drive(it)
	var lines := says(t)
	check(lines.size() == 4, "hello: expected 4 say lines, got %d" % lines.size())
	check(has_say(t, "The room is quiet."), "hello: missing narration line")
	check(has_say(t, "It's you again."), "hello: missing yuki line 1")
	check(has_say(t, "I'm glad you came."), "hello: missing yuki line 2")
	# speaker resolves to the character's display name
	var found_named := false
	for e in lines:
		if e.get("text") == "It's you again.": found_named = e.get("name") == "Yuki" and e.get("speaker") == "yuki"
	check(found_named, "hello: yuki line speaker/name not resolved")
	check(t.back().get("kind") == "finished", "hello: did not finish")

func test_branching(dir: String) -> void:
	# Playthrough A — pick "Say hi": met_yuki=true, branch takes the true arm, jumpToLabel skips the
	# "linger" line, brave +1.
	var a = make_interp(dir)
	var ta := drive(a, [0])
	check(a.state.vars["met_yuki"] == true, "branch A: met_yuki should be true")
	check(a.state.vars["brave"] == 1.0, "branch A: brave should be 1, got %s" % str(a.state.vars["brave"]))
	check(has_say(ta, "You wave. They smile back."), "branch A: true-arm line missing")
	check(not has_say(ta, "You linger a moment too long."), "branch A: jumpToLabel did not skip the linger line")
	check(has_say(ta, "You feel a little braver."), "branch A: post-label line missing")

	# Condition gating — with brave=0 the courage option is hidden (2 options); with brave=3 it shows (3).
	# intro opens with a narration line, so advance once to reach the choice.
	var b = make_interp(dir)
	b.start()
	b.advance()
	check(b.current_event.get("kind") == "choices", "branch B: expected a choice at intro")
	if b.current_event.get("kind") == "choices":
		check(b.current_event.get("options").size() == 2, "branch B: brave=0 should hide the gated option (want 2 options)")

	var c = make_interp(dir)
	c.state.vars["brave"] = 3.0
	c.start()
	c.advance()
	check(c.current_event.get("kind") == "choices" and c.current_event.get("options").size() == 3, "branch C: brave=3 should reveal the gated option (want 3 options)")
	# take the gated option (index 1) → jumps to 'leave'
	c.pick(1)
	check(c.current_scene == "leave", "branch C: gated option should jump to 'leave', at '%s'" % c.current_scene)

func test_saveload(dir: String) -> void:
	# In-story: submit a name, then "Save and continue" (writes slot 1 + jumps to ch2), then "End here".
	var it = make_interp(dir)
	var t := drive(it, [0, 1], ["Alice"])
	check(has_say(t, "Nice to meet you, Alice."), "saveload: {player_name} not interpolated in prologue")
	check(has_say(t, "Chapter 1. The story goes on, Alice."), "saveload: {chapter}/{player_name} not interpolated in ch2")
	check(has_say(t, "Thanks for playing."), "saveload: did not reach the end")
	# the in-story save action wrote slot 1 with the right variables
	var slot1 := "user://saves/slot_1.json"
	check(FileAccess.file_exists(slot1), "saveload: save action did not write slot 1")
	if FileAccess.file_exists(slot1):
		var data = JSON.parse_string(FileAccess.get_file_as_string(slot1))
		check(data != null and data.get("vars", {}).get("player_name") == "Alice", "saveload: slot 1 missing player_name=Alice")
		check(data != null and data.get("vars", {}).get("chapter") == 1.0, "saveload: slot 1 chapter should be 1")

	# Programmatic round-trip: save mid-ch2, then load into a FRESH interpreter and resume there.
	var w = make_interp(dir)
	w.start()                 # prologue: text input
	w.submit_text("Robin")    # -> "Nice to meet you, Robin." (say)
	w.advance()               # past the say (+ set chapter=1) -> the choice
	w.pick(0)                 # "Save and continue" -> jumps to ch2, pauses at its first say
	check(w.current_scene == "ch2", "saveload: expected to be in ch2 after continue")
	w.save_to_slot(2)         # snapshot ch2 at the current line

	var r = make_interp(dir)  # brand-new state
	check(r.load_from_slot(2), "saveload: load_from_slot(2) failed")
	r.advance()               # resume from the restored position
	check(r.current_scene == "ch2", "saveload: restored scene should be ch2, got '%s'" % r.current_scene)
	check(r.state.vars.get("player_name") == "Robin", "saveload: restored player_name should be Robin")
	check(r.state.vars.get("chapter") == 1.0, "saveload: restored chapter should be 1")

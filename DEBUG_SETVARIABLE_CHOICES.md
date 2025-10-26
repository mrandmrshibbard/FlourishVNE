# Debugging SetVariable & Choice Issues

## How to Debug

### Check Browser Console

1. Open your game in the browser (LivePreview or exported game)
2. Open Developer Tools (F12)
3. Go to the Console tab
4. Look for warning messages like:
   - `SetVariable command failed: Variable with ID [id] not found`
   - `SetVariable action failed: Variable with ID [id] not found`

### Test SetVariable Command

1. Create a test scene with these commands:
   ```
   - SetVariable: myTestVar = "Hello"
   - Dialogue: Variable value is: {myTestVar}
   ```

2. Run the scene and check:
   - Does the dialogue show the variable value?
   - Does it advance past SetVariable automatically?
   - Any console errors?

### Test Choice with SetVariable

1. Create a test scene:
   ```
   - Dialogue: "Choose an option"
   - Choice:
     - Option 1: "Pick A" → SetVariable: choice = "A"
     - Option 2: "Pick B" → SetVariable: choice = "B"
   - Dialogue: "You picked: {choice}"
   ```

2. Run and check:
   - Do choices appear?
   - When you click a choice, does it close?
   - Does the dialogue show the correct value?
   - Any console errors?

## Common Issues & Fixes

### Issue 1: Variable Not Found Error

**Symptom:** Console shows `Variable with ID [id] not found`

**Fix:**
1. Go to Variables tab
2. Make sure the variable exists
3. Check that the variable ID matches what's in the command
4. If variable was deleted, recreate it or update the command

### Issue 2: SetVariable Doesn't Advance

**Symptom:** Game stuck on SetVariable command

**Possible Causes:**
- SetVariable is working but there's no visual feedback
- Next command has conditions that aren't met
- Browser console has errors

**Fix:**
- Add a Dialogue command after SetVariable to confirm advancement
- Check command conditions
- Check browser console for errors

### Issue 3: Choice Doesn't Set Variable

**Symptom:** Click choice, menu closes, but variable isn't set

**Fix:**
1. Select the Choice command
2. Click on each choice option
3. In the Properties panel, check the "Actions" section
4. Make sure "Set Variable" action is configured
5. Verify the correct variable is selected
6. Verify the value is set correctly

### Issue 4: Choice Doesn't Close After Click

**Symptom:** Click choice button, nothing happens

**Possible Causes:**
- Choice button isn't clickable
- JavaScript error preventing handler
- Multiple overlapping UI elements blocking clicks

**Fix:**
- Check browser console for errors
- Try removing other UI elements temporarily
- Check if choice has any actions configured

## Quick Test Project

Here's a minimal test to verify everything works:

**Variables:**
- `testVar` (string, default: "not set")

**Scene: Test Scene**
```
1. Dialogue: "Testing SetVariable command..."
2. SetVariable: testVar = "set by command"
3. Dialogue: "Value is now: {testVar}"
4. Dialogue: "Now testing choices..."
5. Choice: "Pick a number"
   - Option 1: "One" → SetVariable: testVar = "1"
   - Option 2: "Two" → SetVariable: testVar = "2"
   - Option 3: "Three" → SetVariable: testVar = "3"
6. Dialogue: "You picked: {testVar}"
7. Dialogue: "Test complete!"
```

If this test works, your SetVariable and Choices are functioning correctly. The issue might be in your specific scene setup.

## What To Share For Help

If you still have issues after testing, share:

1. **Console errors** (screenshot or copy-paste)
2. **Variable setup** (name, type, default value)
3. **Command sequence** (what commands are in your scene)
4. **Expected behavior** vs **actual behavior**
5. **Which system** (LivePreview editor, exported game, or both)

---

## Technical Details (For Advanced Users)

### How SetVariable Works:

1. Command executes
2. Updates `playerState.variables[variableId]` 
3. Automatically advances to next command (`instantAdvance = true` by default)

### How Choice SetVariable Works:

1. User clicks choice option
2. All actions in `choice.actions` array execute
3. If action type is `SetVariable`:
   - Variable updated in `playerState.variables`
4. Choice menu closed (`uiState.choices = null`)
5. If choice has jump action, jump to that scene
6. Otherwise, advance to next command (`currentIndex++`)

### State Update Flow:

Both systems use React's `setPlayerState()` which is asynchronous. The state update triggers a re-render, which processes the next command automatically through the `useEffect` hook.

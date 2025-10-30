# 📱 Phone Messaging Demo - Sample Project

## Overview

This is a complete, ready-to-import sample project demonstrating how to create an interactive cellphone text messaging system in Flourish Visual Novel Engine using **only the Scene Editor and UI Screens** - no coding required!

## How to Import

1. **Launch Flourish Visual Novel Engine**
   - Run `Flourish(run_me).bat` or open `index.html` in your browser

2. **Import the Project**
   - On the Project Hub screen, click **"Import Project"**
   - Select the `Phone_Messaging_Demo.zip` file
   - Click to confirm the import

3. **Start Exploring**
   - The project will load automatically
   - Click **"Play"** in the top toolbar to test the demo
   - Explore the Scene Editor and UI Screens to see how it works

## What This Demo Includes

### 📱 Two Phone Implementation Methods

#### **Method 1: Player-Initiated Phone Check (Show Button)**
- Phone icon appears in top-right corner (📱)
- Player clicks when ready to check messages
- Scene pauses until button is clicked
- Great for optional phone interactions

#### **Method 2: Forced Phone Notification (Show Screen)**
- Phone screen appears automatically
- Scene pauses immediately
- Perfect for important story moments
- No phone icon needed

### 🎯 Features Demonstrated

✅ **Interactive Message Screens**
- Custom phone UI with message bubbles
- Multiple response options
- Conditional message chains (follow-up conversations)

✅ **Variable-Based Branching**
- Tracks player choices in variables
- Conditional dialogue based on responses
- Story branches based on decisions

✅ **Conditional UI Elements**
- Buttons that appear/disappear based on conditions
- Multi-step button interactions (click → action → close screen)
- Follow-up messages triggered by initial responses

✅ **Multiple Phone Screens**
- Initial message screen
- Follow-up conversation screen
- Direct notification screen

## Project Structure

### Scenes
- **Introduction** - Main scene demonstrating both phone methods

### Variables
- **Phone Response** - Tracks initial message response
- **Followup Response** - Tracks follow-up conversation choice
- **Relationship with Alex** - Example stat variable (for future use)

### UI Screens

#### Phone Screens
1. **Phone - Message 1** (`screen-phone-message-1`)
   - First message from Alex
   - Three response options with conditional visibility
   - Demonstrates button chaining (action → close)

2. **Phone - Follow-up** (`screen-phone-followup`)
   - Appears only if player asked for more info
   - Conditional screen based on first response
   - Final decision point

3. **Phone - Direct Screen** (`screen-phone-direct`)
   - Example of Show Screen command
   - Automatic scene pause
   - Simple close button

#### Standard Screens
- Title Screen
- Settings Screen
- Save/Load Screens
- Pause Screen

## How It Works

### The Phone Icon Button Technique

In the **Scene Editor**, you'll see commands like:

```
Show Button: 📱
  - Position: Top-right corner (90%, 10%)
  - On Click: Go To Screen → "Phone - Message 1"
  - Wait For Click: ✅ Enabled (pauses scene)
```

This creates a clickable phone icon that pauses the scene until the player interacts with it.

### The Button Chaining Technique

Each phone screen has **invisible overlay buttons** that:

1. **First button** - Sets a variable when clicked
   - Example: "Sure! I'd love to ☕" sets `phoneResponse = "agreed"`
   
2. **Second button** (invisible, conditional) - Closes the screen
   - Only appears after first button is clicked
   - Returns to previous screen automatically
   - Creates seamless interaction

This is done using **Conditional Visibility**:
- Button 1: No conditions
- Button 2: Condition: `phoneResponse == "agreed"`

### The Conditional Branching

After the phone interaction, the scene continues with conditional dialogue:

```
Dialogue: "You agreed to meet Alex! ☕"
  Condition: phoneResponse == "agreed"

Dialogue: "You politely declined."
  Condition: phoneResponse == "declined"
```

## Customization Ideas

### 🎨 Visual Enhancements
- Add phone frame images (upload to Backgrounds)
- Use different colors for sent/received messages
- Add custom button images for the phone icon
- Create message bubble graphics

### 🔊 Audio Effects
- Add notification sound when phone buzzes
- Click sound when sending messages
- Typing sound effect during message display

### 📊 Advanced Features
- Use **Game HUD Screen** for persistent phone icon
- Create multiple contacts with different conversations
- Add emoji or image messages
- Build a full messaging app UI
- Track message history with variables
- Add timestamps with text overlays

### 🎮 Gameplay Integration
- Use phone for mission briefings
- Create dating sim mechanics
- Add detective investigation via texts
- Build relationship systems
- Trigger story events via messages

## Key Learnings from This Demo

1. **Show Button** + **Wait for Click** = Player-controlled interactions
2. **Show Screen** = Automatic story interruptions
3. **SetVariable actions** = Track player choices
4. **Conditional visibility** = Dynamic UI elements
5. **Button chaining** = Seamless multi-step interactions
6. **Conditional commands** = Branching narratives

## Tips for Your Own Projects

### Best Practices
- **Name your screens clearly** (e.g., "Phone - Contact Name")
- **Use consistent variable naming** (`phone_`, `msg_`, etc.)
- **Test both acceptance and rejection paths**
- **Add subtle transitions** for polish (0.3s fade works well)

### Common Patterns
1. **Phone Buzz → Show Button → Player Clicks → Screen Opens**
2. **Screen Opens → Player Responds → Variable Set → Screen Closes**
3. **Scene Continues → Conditional Dialogue → Story Branches**

### Troubleshooting
- **Button not working?** Check that action is set correctly
- **Screen not closing?** Ensure "Return To Previous Screen" action
- **Condition not working?** Verify variable name matches exactly
- **Button always visible?** Check condition operator (== not =)

## File Information

- **File**: `Phone_Messaging_Demo.zip`
- **Size**: ~6 KB (no assets included)
- **Format**: Flourish VNE Export Format (.zip)
- **Version**: Compatible with Flourish VNE 2.0+
- **Assets Required**: None (uses text and colored backgrounds only)

## What to Do Next

1. **Play through the demo** to see both methods in action
2. **Open Scene Editor** and examine the command structure
3. **Open Menu Editor** and inspect the phone screen layouts
4. **Modify the messages** to create your own conversation
5. **Add your own assets** (phone backgrounds, icons, sounds)
6. **Expand the story** by adding more scenes and choices

## Technical Details

### Scene Commands Used
- `Dialogue` - Story narration and conditional text
- `ShowButton` - Creates the phone icon with actions
- `ShowScreen` - Displays phone UI as overlay
- Conditional visibility on all commands

### UI Elements Used
- `Text` elements - Headers, labels, message text
- `Button` elements - Response options with actions
- `Image` elements - Placeholder for message backgrounds

### Actions Used
- `GoToScreen` - Open phone screens
- `SetVariable` - Track player choices
- `ReturnToPreviousScreen` - Close phone screens
- `StartNewGame` - Title screen start button

### Variables Used
- `var-phone-response` (string) - First message response
- `var-followup-response` (string) - Follow-up response
- `var-relationship-alex` (number) - Example stat variable

## Credits

Created as a demonstration project for the Flourish Visual Novel Engine community. Feel free to use this as a template for your own projects!

## Support

If you have questions or need help:
1. Check the in-app documentation (`docs/index.html`)
2. Examine the Scene Editor command properties
3. Inspect the Menu Editor screen layouts
4. Experiment with modifications - you can't break it!

---

**Happy Creating! 🎮✨**

*This demo proves you don't need any programming knowledge to create sophisticated interactive mechanics in visual novels. Everything you need is already built into the Scene Editor and UI Screens system!*

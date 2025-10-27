# Character Customization Setup Guide

## Your Current Situation
You have assets named like:
- `body_fem_brown`
- `body_fem_tan`
- `body_fem_mixed`
- `body_masc_white`
- etc.

All these assets are in a single layer called `bodytype`.

You want players to independently select body type (fem/masc) and skin color (brown/tan/white/mixed), and have the correct combination display.

## Step-by-Step Setup

### Step 1: Create Variables
Go to **Variables Manager** and create 3 string variables:
1. `body_type` - Will store the selected body type asset
2. `skin_color` - Will store the selected skin color asset
3. `body_result` - Will store the final combined asset to display

### Step 2: Create UI Screen
Go to **UI Manager** and create a new screen (or use existing one) for character customization.

### Step 3: Add Body Type Cycler
**Add AssetCycler #1 - Body Type Selector:**
1. Click "+ UI Element" → Select "AssetCycler"
2. Configure in Inspector:
   - **Label**: "Body Type" (or whatever you want)
   - **Character**: Select your character
   - **Layer**: `bodytype`
   - **Variable ID**: Select `body_type`
   - **Assets**: Check at least 2 different body types:
     - ✅ `body_fem_brown` (or any fem asset)
     - ✅ `body_masc_white` (or any masc asset)
   - **Filter Variables**: Leave empty (no filtering)
   - **Filter Pattern**: Leave empty (no filtering)
3. Position it on screen (left side recommended)

### Step 4: Add Skin Color Cycler
**Add AssetCycler #2 - Skin Color Selector:**
1. Click "+ UI Element" → Select "AssetCycler"
2. Configure in Inspector:
   - **Label**: "Skin Color"
   - **Character**: Select your character
   - **Layer**: `bodytype`
   - **Variable ID**: Select `skin_color`
   - **Assets**: Check at least 2 different skin colors:
     - ✅ `body_fem_brown` (or any brown asset)
     - ✅ `body_masc_white` (or any white asset)
     - ✅ `body_fem_tan` (or any tan asset)
   - **Filter Variables**: Leave empty (no filtering)
   - **Filter Pattern**: Leave empty (no filtering)
3. Position it on screen (middle recommended)

### Step 5: Add Filtered Result Cycler
**Add AssetCycler #3 - Combined Result (Filtered):**
1. Click "+ UI Element" → Select "AssetCycler"
2. Configure in Inspector:
   - **Label**: "Body" (or leave blank)
   - **Character**: Select your character
   - **Layer**: `bodytype`
   - **Variable ID**: Select `body_result`
   - **Assets**: Check ALL body assets (all 8 of them)
   - **Filter Variables**: 
     - Click "+ Add Filter Variable"
     - Select `body_type`
     - Click "+ Add Filter Variable" again
     - Select `skin_color`
   - **Filter Pattern**: Type exactly: `{[1]}_{[2]}`
3. Position it on screen (right side or hidden - this is for selection, not necessarily display)

### Step 6: Add Character Preview
**Add CharacterPreview to display the result:**
1. Click "+ UI Element" → Select "CharacterPreview"
2. Configure in Inspector:
   - **Character**: Select your character
   - **Position/Size**: Make it large enough to see the character
   - **Layer Variable Map**: 
     - Find the `bodytype` layer in the list
     - Click the dropdown next to it
     - Select `body_result` variable
3. Position it prominently on screen (center recommended)

### Step 7: Test It!
1. Save your project (Ctrl+S)
2. Go to Live Preview
3. Navigate to your customization screen
4. You should see:
   - **Body Type arrows** - Click to cycle through fem/masc
   - **Skin Color arrows** - Click to cycle through brown/white/tan/mixed
   - **Body arrows** - Should only show matching combinations
   - **Character Preview** - Should display the selected combination

## How It Works

1. **User clicks Body Type arrows** → Sets `body_type` to (for example) `body_fem_brown`
2. **User clicks Skin Color arrows** → Sets `skin_color` to (for example) `body_masc_white`
3. **Filtered cycler automatically updates:**
   - Extracts part [1] from `body_fem_brown` → gets `fem`
   - Extracts part [2] from `body_masc_white` → gets `white`
   - Pattern `{[1]}_{[2]}` becomes `fem_white`
   - Shows only assets containing "fem_white" (e.g., `body_fem_white`)
4. **User clicks Body arrows** (optional) → Selects specific variant if multiple match
5. **Selected asset stored** in `body_result`
6. **CharacterPreview reads** `body_result` and displays that sprite

## Troubleshooting

### "No sprite shows"
- Check CharacterPreview's Layer Variable Map is set to `body_result`
- Make sure the filtered cycler's Variable ID is `body_result`
- Check browser console for `[CharacterPreview]` logs

### "Filtered cycler shows no assets"
- Check that Filter Variables are in the right order: `body_type` first, `skin_color` second
- Check Filter Pattern is exactly: `{[1]}_{[2]}`
- Make sure both master cyclers have been clicked at least once (to set their variables)
- Check browser console for `[AssetCycler] Filtering with resolved pattern:` logs

### "Filtering doesn't match anything"
- Verify your asset names follow the pattern: `body_TYPE_COLOR`
- Check console logs to see what pattern is being generated
- Make sure asset names use underscores `_` as separators

## Advanced: Understanding the Pattern

Your assets are structured as: `prefix_attribute1_attribute2`
- Part [0] = `body` (prefix)
- Part [1] = `fem` or `masc` (body type)
- Part [2] = `brown`, `white`, `tan`, `mixed` (skin color)

The pattern `{[1]}_{[2]}`:
- Takes part [1] from the first filter variable's asset
- Takes part [2] from the second filter variable's asset
- Combines them: `fem_white`, `masc_brown`, etc.
- Finds all assets whose name contains that combination

## Tips

- You can hide the third cycler (filtered one) if you want it to auto-select
- You can make the master cyclers show images instead of just arrows
- You can add labels and styling to make it look nice
- The system is case-insensitive, so `Fem_White` matches `fem_white`
- If you add more attributes later (like clothing), just add another filter variable and extend the pattern: `{[1]}_{[2]}_{[3]}`

## What's Next?

Once this is working, you can:
- Add more layers (hair, clothing, accessories)
- Create separate variables and cyclers for each layer
- Map multiple layers in CharacterPreview's Layer Variable Map
- Build a complete character creator!

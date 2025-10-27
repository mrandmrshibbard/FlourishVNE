# Character Customization Sample Project

## What This Is

This is a **complete, working example** of the multi-variable character customization system using AssetCycler filtering.

## What It Demonstrates

- **3 AssetCyclers** working together:
  1. **Body Type Selector** - Cycles between fem/masc body types
  2. **Skin Color Selector** - Cycles between brown/mixed/tan/white skin tones
  3. **Result Cycler (Filtered)** - Automatically shows only matching combinations using the pattern `{[1]}_{[2]}`

- **CharacterPreview** - Displays the selected character in real-time

- **Multi-Variable Filtering** - Uses part extraction to combine independent attributes

## How to Use

### 1. Import the Project

1. Open Flourish Visual Novel Engine
2. Click "Import Project" in the Project Hub
3. Select `character_customization_sample_export.zip`
4. Wait for import to complete

### 2. Test the System

1. After import, the project will open automatically
2. Click "Live Preview" tab
3. You'll see the Title Screen - click "Start Game"
4. This opens the Character Customization screen

### 3. Try It Out

**Body Type Selector:**
- Click the < > arrows
- Cycles between feminine and masculine body types
- Each click sets the `body_type` variable to an asset

**Skin Color Selector:**
- Click the < > arrows
- Cycles between different skin tones
- Each click sets the `skin_color` variable to an asset

**Result Cycler (Auto-Filtered):**
- Watch this cycler automatically update!
- It filters the 8 total assets down to only matching combinations
- Uses the pattern `{[1]}_{[2]}`:
  - Extracts part [1] (type: fem/masc) from `body_type`
  - Extracts part [2] (color: brown/mixed/tan/white) from `skin_color`
  - Creates pattern like "fem_brown" or "masc_white"
- Only shows assets that match the pattern

**Character Preview:**
- Shows the selected character sprite
- Updates in real-time as you make selections
- Displays whatever asset is stored in the `body_result` variable

## How It Works

### Asset Naming

All sprites follow the naming convention: `body_TYPE_COLOR`
- `body_fem_brown`
- `body_fem_mixed`
- `body_fem_tan`
- `body_fem_white`
- `body_masc_brown`
- `body_masc_mixed`
- `body_masc_tan`
- `body_masc_white`

### The Pattern: `{[1]}_{[2]}`

When you split asset names by `_`:
- Part [0] = `body` (prefix)
- Part [1] = `fem` or `masc` (body type)
- Part [2] = `brown`, `mixed`, `tan`, `white` (skin color)

The filtered cycler:
1. Gets the asset name from `body_type` variable (e.g., `body_fem_brown`)
2. Extracts part [1]: `fem`
3. Gets the asset name from `skin_color` variable (e.g., `body_masc_white`)
4. Extracts part [2]: `white`
5. Creates pattern: `fem_white`
6. Shows only assets containing `fem_white` in their name

### Variables

- `body_type` (string) - Stores asset ID from body type selector
- `skin_color` (string) - Stores asset ID from skin color selector
- `body_result` (string) - Stores final selected asset ID for display

### UI Configuration

**Body Type Cycler:**
- Variable: `body_type`
- Assets: `[asset-fem-brown, asset-masc-brown]`
- No filter

**Skin Color Cycler:**
- Variable: `skin_color`
- Assets: `[asset-fem-brown, asset-fem-mixed, asset-fem-tan, asset-fem-white]`
- No filter

**Result Cycler:**
- Variable: `body_result`
- Assets: All 8 body sprites
- Filter Variables: `[body_type, skin_color]`
- Filter Pattern: `{[1]}_{[2]}`

**Character Preview:**
- Character: Player Character
- Layer Variable Map: `body` → `body_result`

## Customizing for Your Project

### To add more body types:
1. Add assets named like `body_NEWTYPE_COLOR`
2. Add asset to Body Type Cycler
3. Result Cycler will automatically include it

### To add more skin colors:
1. Add assets named like `body_TYPE_NEWCOLOR`
2. Add asset to Skin Color Cycler
3. Result Cycler will automatically include it

### To add a third attribute (e.g., clothing):
1. Name assets: `body_TYPE_COLOR_CLOTHING`
2. Create a third master cycler for clothing
3. Create a new variable `clothing_style`
4. Update Result Cycler:
   - Add third filter variable: `clothing_style`
   - Change pattern to: `{[1]}_{[2]}_{[3]}`

## Technical Details

- **Part Extraction**: Uses `[index]` syntax to extract specific parts from underscore-separated names
- **Position-Based**: `{[1]}` means "first filter variable's asset, part 1"
- **Case-Insensitive**: Matching ignores case differences
- **Graceful Degradation**: Shows all assets until filter variables are set
- **Real-Time Updates**: Re-filters automatically when any filter variable changes

## Troubleshooting

**No sprite showing:**
- Check that CharacterPreview's Layer Variable Map is set
- Verify the mapped variable matches Result Cycler's variable

**Filtering not working:**
- Verify filter variables are in correct order
- Check that asset names follow the `prefix_attr1_attr2` pattern
- Look at browser console for `[AssetCycler]` logs

**Wrong combinations showing:**
- Verify the pattern matches your asset naming
- Check that part indices are correct (count from 0)

## Files in This Export

```
character_customization_sample_export.zip
├── project.json              # Project configuration
├── manifest.json             # Export metadata
└── assets/
    └── characters/
        └── char-player/
            ├── asset-fem-brown_body_fem_brown.png
            ├── asset-fem-mixed_body_fem_mixed.png
            ├── asset-fem-tan_body_fem_tan.png
            ├── asset-fem-white_body_fem_white.png
            ├── asset-masc-brown_body_masc_brown.png
            ├── asset-masc-mixed_body_masc_mixed.png
            ├── asset-masc-tan_body_masc_tan.png
            └── asset-masc-white_body_masc_white.png
```

## Next Steps

After importing and testing this sample:
1. Study how the cyclers are configured in UI Manager
2. Look at the variable setup in Variables Manager
3. Examine the CharacterPreview layer mapping
4. Try modifying the filter pattern to see how it changes behavior
5. Add your own assets and adapt the system to your needs

## Support

If you encounter issues:
1. Check browser console for `[AssetCycler]` and `[CharacterPreview]` logs
2. Verify all variables are string type
3. Ensure filter variables array is in the correct order
4. Confirm asset names follow the expected pattern

Refer to `SETUP_CHARACTER_CUSTOMIZATION.md` and `MULTI_VARIABLE_FILTERING_GUIDE.md` for detailed documentation.

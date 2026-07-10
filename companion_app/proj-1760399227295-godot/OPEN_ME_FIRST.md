# Always and Forever — your game as a Godot project

This folder is a **ready-to-open Godot 4.3 project** of your visual novel. It contains the player
runtime plus your game's data (in `bundle/`). You can open and play it right now on your computer.

## Play it on your computer (no console needed)

1. Install **Godot 4.3** (free): https://godotengine.org/download/archive/#4.3-stable
2. Open Godot, click **Import**, and pick the `project.godot` file in this folder.
3. Press **Play** (▶, top-right). Your game runs.

## Building for a console (Xbox / PlayStation / Switch)

Getting your game onto a console is **your** step, in **your** own environment — and it requires two
things this tool intentionally does **not** and **cannot** provide:

1. **Platform developer approval.** You must be an approved developer with the platform holder
   (Microsoft / Sony / Nintendo). This is a per-developer agreement under NDA.
2. **A W4 Consoles license** (or your own console export templates). Godot's console support ships
   privately, only to approved developers, through **W4 Games**: https://www.w4games.com/

Once you have both, on **your** machine:

- Install the W4 Consoles export templates into **your** Godot (per W4's private instructions).
- Open this project and export to your target console through Godot's normal export flow.
- Build, sign, and submit for certification using **your** platform credentials.

> This tool removes the project-setup work. It does **not** make your game auto-pass certification —
> expect real per-game work (controller polish, performance, memory, cert fixes), typically a few
> months for a first console port. That work stays on your side, by design.

## What this tool did / did not do

- **Did:** generate a stock-Godot project, drop in the runtime, embed your game, and write this guide.
- **Did NOT (ever):** download or bundle any console SDK; handle any signing key or certificate;
  perform any build; or include W4's middleware or export templates. Those live only with you, under
  your own licenses.

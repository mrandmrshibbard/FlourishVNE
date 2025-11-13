Tutorial - Getting Started

  Download the zip file and extract the folder

  Launch the executable (the rainbow icon)

  When the program loads, you’ll be in the project hub

  You can create a new project or import one you saved



Overview-

The Main Editor

  Click Create New Project and you’ll be taken to the main Scenes editor

  To the left, you’ll find the Scene tree, and under that the color coded command palette

  In the middle of the screen, you’ll see a blank window called the “Staging Area”

  This is where you can view your scenes update in real time as you click and edit your commands

  Under the staging area is the Scene Editor

  This is where you will drag and drop your commands when you start working on a scene

  When clicking on a command in the Scene Editor, you will see the properties inspector on the right

  This is whee you can edit things like dialogue text, select images, or add conditionals to commands



Navigate the Managers

  There are several ways to get around in Flourish

  You can click the tabs at the top of the page, use the 1-6 number keys

  Or hold shift and take a number key to pop out a manager into a window

  You can then Alt+Tab between the main editor and manager for faster workflows



Characters Tab

  Here, we can add and edit characters

  When you add a character, you need to add layers to upload sprite assets for the character

  Once you have a layer with assets, go to the right and scroll down to find expressions

  You can have as many expressions as you like and each one can use multiple layers

  Either create an expression or select an existing one and scroll down to find the layer dropdown box

  Here you will select your assets to be displayed in that expression

  Once your expression has assets selected, the sprites will be shown in the character preview to the left



UI Tab

  In this tab, you will find the UI Editor, where you can customize and create UI screens

  By default, every project starts with a list of default screens

  These are fully customizable and can be duplicated

  If, for some reason, you should want or need to restore these screens, click the Restore Default Screens button at the bottom of the screens list

  This won’t delete your current screens, but rather add fresh default screens to your list

  In the middle, you will find the man UI Editor that allows you to drag and resize elements

  Under that, a list of buttons to add various elements to your screen

  Each element has it’s own properties and uses, which can be found to the right after clicking on an element in the UI Editor window



Assets Tab

  This is where you will upload all of your backgrounds, audio, videos, and images for your project

  There are categories to the left that can be clicked, allowing you to upload to this specific category

  In the middle, you can view and search through your assets

  You can also create folders to further organize

  The upload button is to the top right



Variables Tab

  Next, we have the variables tab, where you can create and manage your projects variables

  Variables are a powerful part of most visual novels

  They allow the creation of advanced systems and branching conditional paths

  When adding a variable, you can choose between number, string, or boolean

  These can then be referenced in commands or screens (by using {} brackets with the variable NAME, not value, in the middle)



Setting Tab

  Setting tab allows you to change the name and start scene of your project, add dialogue and choice box images, and change their font

  You can also manage screens here, and even add screens to be Game HUDs if you like



Templates

  Lastly, we have templates, a list of template systems to help you get started with a character creator or shop system

  This will create a screen, along with elements and variables to use in the system





Tips:

  You can add music and sfx to UI screens, as well as videos

  If you want the music to continue to play through certain screens, you can select a playback policy that will continue to play on screens with the same music or sfx selected

  

  When using the character creator, you will need a variable for each of the layers in your sprite.

  For each layer, all of the assets for that specific layer

  In UI, select the character creator screen and look at the asset cyclers (boxes with left and right arrows)

  Each of these will need a layer selected and a variable assigned to it

  There is also a character preview window next to these

  Click it and you will assign a character, a default expression, and map your layers to the again variables

  Then when you use your creator in game, you can click the arrows to cycle through the assets in each layer, which sets the variable to the selected asset in the layer

  Then, when you use the show character command in scene, you will see the selected assets for the character!



  Buttons can take players to screens, and there is a show screen command as well

  It’s a good idea to have a button that will take the player from the creator or shop screen to a scene or another screen



  You can use conditionals to all commands and even to some ui elements

  This is useful when used with the set variable command or with choice  or button commands that set variables

  Conditionals make it so that commands only run when a variable condition is met

  If it is not met, the command is skipped entirely

  Using this with a Branch command creates entire scene sequences and story paths that are affected by player’s actions
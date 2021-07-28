## Creating a react component library

The company I'm working with contracted a third party to develop a new b2b e-commerce website.

While they are in charge of developing the front end, we will want to have control over the styles, and make any changes in theme easy to implement.

We decided to create a shared library that would serve as the base for the design of the new website. The idea is to create a theme that can be imported, making any changes in style easier. 

After evaluating some of the style solutions I decided to go with the Material-ui style, since it's flexible enough to represent the style sheet I received from the UX team, which is a bit unusual compared to the standard themes found in many UI libraries.

It contains 5 variations for each palette; "Darkest", "Dark", "Main", "Light" and "Lightest", and some specific spacings for each use case, like "Spacing Inline" for spacing content in the same line and "Spacing Inset", for padding used inside containers.

So the main objective is to create a library with this style sheet coded into a theme that can be imported on the final project.

We also plan to use it to store the basic components the third party will create, so it would be good to have an example of use, documentation and Storybook to test and validate the components.


## Create-react-app

I decided to use create-react-app (with the typescript template) to speed up the proccess. Even if I'm not creating a SPA, having already Babel, Webpack, Jest and hot reloading is a big head start.

    cd /project-folder
    npx create-react-app . --template typescript

We can then remove most of the files not related to those tools:

    rm src/App.css src/App.test.tsx src/App.tsx src/logo.svg src/index.css src/index.tsx && rm -rf public/


## Storybook

An important part of the component library is being able to test and see the components and it's variants. Storybook is one of the most popular tools to do that, and it's pretty easy to add it to a create-react-app project.

    npx sb init

After this you can run ``yarn storybook`` to start the storybook locally and run ``yarn build-storybook`` to create a build folder you can deploy.
It comes with some example components and some introduction. The doc pages can be written with .mdx format, which is a markdown file where you can ReactJs components directly.

### Storybook theme

Out of the box the default storybook UI uses light theme, which sucks. Also, I want my library to be dark theme based, so it would be helpful to test the components if we were to use Storybook's dark theme.

Luckly it's pretty easy to change it to dark theme.
First install the storybook's theming addon:

    yarn add --D @storybook/addons @storybook/theming

After that create a `.storybook/manager.js` file and paste this in:

    import { addons } from '@storybook/addons';
    import { themes } from '@storybook/theming';
    addons.setConfig({
      theme: themes.dark,
    });

For the documentation for also be dark themed, you need to add something similar on ``.storybook/preview.js``:


    import { themes } from '@storybook/theming';

    export const parameters = {
      ...,
      docs: {
        theme: themes.dark,
      },
    }



## Extend M-UI default theme or create one from scratch

Material-ui has a styling solution independent of material-ui core, so you can import only the styling utilities without any default values being set. It's a very strong styling solution that fit most projects very well, it even has 3 different ways structure your styling.

You can also import the style from the core package, which comes with the default theme that all the mui components use. Instead of creating a new theme from zero, it's possible to extend the default theme, changing the values and even adding completely different objects to it.

### So, should you go with just the styling solution or extend the default theme?

This is a pretty interesting question. The mui default theme has a lot of things already, but changing it to fit the stylesheet is not as easy as just creating a theme from scratch. 

Extending the mui theme makes sense if you are already planning on using mui components, and you are importing it anyway. On my case, the projects that will use this component library already use material-ui, so extending the default theme makes more sense.

### Extending the M-UI theme in typescript

Since we are using typescript, it's also needed to extend the interface definitions of the mui theme.

For the palette, mui has a primary and secondary color, and each color has dark, main, light and contrast text.


    interface PaletteColor {
      light: string;
      main: string;
      dark: string;
      contrastText: string;
    }


For my case, the palette our UI team created had 2 aditional colors; **tertiary** and **neutral**, and within each color 2 aditional variations; **darkest** and **lightest**.

Here is the extended interfaces. ``PaletteOptions`` is the type that the createMuiTheme function receives and ``Palette`` is the actual type of ``theme.palette``.


    declare module '@material-ui/core/styles/createPalette' {
      interface PaletteColor {
        darkest: string;
        lightest: string;
      }
      interface SimplePaletteColorOptions {
        darkest: string;
        lightest: string;
      }
      interface Palette {
        tertiary: PaletteColor;
        neutral: PaletteColor;
      }
      interface PaletteOptions {
        tertiary?: PaletteColorOptions;
        neutral?: PaletteColorOptions;
      }
    }


### Creating a custom button using this new palette

The default MUI Button component accepts primary and secondary palettes, so if you only changed that, it works perfectly without any customization. In our case, we created a tertiary color as well as some other variants for each color, so it makes sense to create a custom button that extends the Mui Button.


    const Button: React.FC<ButtonProps> = ({ color, children, ...props }) => {
      const classes = useStyles({ color, ...props });
      return (
        <MuiButton className={classes.root} variant="outlined" {...props}>
          {children}
        </MuiButton>
      );
    };


So the whole customuzation is done in the useStyles function, that accepts our props. 

Here is our interface:


    export interface ButtonProps {
      color?: "primary" | "secondary" | "tertiary" | "neutral";
      variant?: "outlined" | "contained";
      children?: React.ReactNode;
    }


The makeStyles:


    const useStyles = makeStyles((theme) => ({
      root: (props: ButtonProps) => {
        let color = props.color ? props.color : "primary";
        if (props.variant && props.variant === "contained") {
          return {
            color: theme.palette[color].contrastText,
            backgroundColor: theme.palette[color].main,
            "&:hover": {
              backgroundColor: theme.palette[color].dark,
            },
          }
        } else {
          return {
            borderWidth: '2px',
            borderColor: theme.palette[color].dark,
            color: theme.palette[color].dark,
          }
        }
      },
    }));


Doing it like this, Mui makeStyles has access to both theme and our props, so we can customize what style we want.
Here having typescript is really helpful since we know that if props.color is not undefined, it will be one of our palette colors.


### Exporting the interface of the new theme

If you try to use the new theme in another project (as it's intended) typescript will give you a type error. 


    const useStyles = makeStyles((theme) => ({
      mainBox: {
        backgroundColor: theme.palette.primary.lightest,
      },
    }));

This gives you:

    Property 'lightest' does not exist on type 'PaletteColor'.ts(2339)


Which makes sense, the makeStyles assumes you are using the default mui theme, which doesn't have that property. We redefined the interface when we created the theme, but we are not exporting it. 

So on the same file as we redefined the theme, we should export it:


    import { createMuiTheme, Theme } from '@material-ui/core/styles';

    export type { Theme };


Since we are exporting everything from the index, we should re-import and re-export it there as well:


    import customTheme, { Theme } from './theme';

    export type { Theme as CustomTheme };


After doing that, we can import that type declaration and have access to that on createStyle on the other projects:


    import { CustomTheme } from 'vv-front-components/lib/CustomTheme';

    const useStyles = makeStyles((theme: CustomTheme) => ({
        mainBox: {
        backgroundColor: theme.palette.primary.lightest,
      },
    }));



## Creating your own theme

Honestly, compared to that, creating your own theme is super easy.

Just create a theme object :


    const _gray = {
      100: '#F2F5F8',
      200: '#D7E1EA',
      300: '#94AFC7',
      700: '#1D2734',
      800: '#161D27',
      900: '#090C10',
    };

    const _theme = {
      palette: {
        accent: '#FFB01F',
        white: '#FFFFFF',
        gray: _gray,
        background: _gray[900],
        text: {
          primary: _gray[100],
          secondary: 'rgba(255, 255, 255, 0.7)'
        }
      }
    };


and use it with theme provider:


    export default function ThemeProvider( props: ThemeProps ) {
      return (
        <MuiThemeProvider theme={_theme}>
          {props.children}
        </MuiThemeProvider>
      );
    }

Make sure to also export the type of the theme you created:

    export type Theme = typeof _theme;


That's it really. You can then use your theme with the styling solutions:


    import { Theme } from '../ThemeProvider';

    const useStyles = makeStyles((theme: Theme) => ({
      root: {
        background: theme.palette.accent,
        color: theme.palette.text.primary,
        border: 0,
        borderRadius: 3,
      },
    }));


You can then create your beautiful button! 


    interface ButtonProps {
      children: React.ReactNode;
    }

    const Button = (props: ButtonProps) => {
      const classes = useStyles();
      return (
        <button className={classes.root}>
          {props.children}
        </button>
      );
    }


## Creating stories for your components

Now that we have a theme and a basic button, we should create a story for it to show on Storybook.

First we need to set up storybook so it uses our theme around the stories we create.
On ``.storybook/preview.js`` import your theme and add a decorator:


    import ThemeProvider from '../src/lib/ThemeProvider';
    ...
    export const decorators = [
      Story => (
        <ThemeProvider>
          <Story />
        </ThemeProvider>
      )
    ]


With this, all our components inside the stories will have access to the theme.

Now, for our Button component we will create a file named ``Button.stories.mdx``. 


    import { Meta, Story, Canvas } from '@storybook/addon-docs/blocks';
    import Button from '.';

    <Meta title="UI/Button" component={Button} />

    # Button

    Yosemite Button

    ## Variants

    <Canvas>
      <Story name="Light" args={{children: "Click me!", variant: "light"}}>
        {(args) => <Button {...args} />}
      </Story>
    </Canvas>
    <Canvas>
      <Story name="Dark" args={{children: "Click me!", variant: "dark"}}>
        {(args) => <Button {...args} />}
      </Story>
    </Canvas>


``<Meta title="UI/Button" component={Button} />``
The Meta tag is where we choose where our story goes on the storybook tree sidebar. In this case it would go under the `UI` section and be called `Button`

Every story we define will show up as a subitem under this `Button` category. On this case, we have 2 stories that will show up as `Light` and `Dark`.

On the `Docs` tab is where all the mdx documentation will actually show up, on the `Canvas` tab only the components rendered inside the Story tag shows up.

## Building the library

There are many available options to build the library into an usable state, a popular choice is rollup. Since we are using typescript we can also just use the tsc compiler to build the folder we will export on npm as our package.

If we set "noEmit: false" on the tsconfig.json tsc will output the compiled project into a files. But if you just set noEmit to false on the tsconfig.json you will be greeted with this message the next time you run yarn tests:


    $ yarn test
    yarn run v1.22.5
    $ react-scripts test --watchAll=false
    The following changes are being made to your tsconfig.json file:
      - compilerOptions.noEmit must be true


And noEmit will be true again. One way to get around that is to create a separated tsconfig for building the project and using that explicitly when building it.

Create a ``tsconfig.build.json`` and on that file put noEmit as false:


    {
      "extends": "./tsconfig.json",
      "compilerOptions": {
        "outDir": "lib",
        "noEmit": false
      },
      "exclude": [
        "**/*.test.tsx",
        "**/*.stories.tsx"
      ]
    }


This extends the normal tsconfig, prefering the new values if the same attribute is declared.

So our build script becomes:
``"build": "tsc --build tsconfig.build.json"``

Most of the configuration can stay on the tsconfig.json, which will just be extended.

Here is the tsconfig.json file:


    {
      "compilerOptions": {
        "baseUrl": "src",
        "target": "es5",
        "lib": [
          "dom",
          "dom.iterable",
          "esnext"
        ],
        "allowJs": false,
        "allowSyntheticDefaultImports": true,
        "alwaysStrict": true,
        "declaration": true,
        "declarationMap": true,
        "esModuleInterop": true,
        "forceConsistentCasingInFileNames": true,
        "isolatedModules": true,
        "jsx": "react-jsx",
        "module": "esnext",
        "moduleResolution": "node",
        "noFallthroughCasesInSwitch": true,
        "noImplicitAny": false,
        "noImplicitReturns": true,
        "noImplicitThis": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "resolveJsonModule": true,
        "sourceMap": true,
        "strict": true,
        "strictFunctionTypes": true,
        "strictNullChecks": true,
        "strictPropertyInitialization": true,
        "noEmit": true
      },
      "include": [
        "src/lib"
      ]
    }



``declaration`` created .d.ts files with types for every file, essential for other typescript projects to be able to use the library.
``sourceMap`` creates annotations for js files that tools like debuggers can use to better navigate the project
``declarationMap`` creates annotations similar to sourceMap but for the .d.ts files

The rest of the options are more related what tsc considers and error and how it builds the code. You can learn more about each option on https://www.typescriptlang.org/tsconfig .

With this running ``yarn build`` will generate a /lib folder on the root of the project. That will be the folder we will be exposing as our npm package.

## Publishing on npm

Since we are compiling everything we want to publish into the /lib folder, we just need to add that to our package.json and npm will ignore the rest (outside of the basic project files: package.json, README, CHANGELOG and LICENSE)
We also need to specify the entry point to our package, in this case '/lib/index.js'.

package.json

    ...
      "private": false,
      "main": "lib/index.js",
      "directories": {
        "lib": "lib"
      },
      "files": [
        "lib"
      ]`
    ...



To see what files will be included you can run ``npx npm-packlist``, it should only include the files inside /lib as well as the README and package.json

Now we just need to create an account on npm:

    npm adduser

and publish our package:

    npm publish

And that's it! Now you can install your library anywhere using ``yarn add library-name``!

If you get an 403 error, check to see if a package with the same name doesn't already exists and make sure to verify your email address.


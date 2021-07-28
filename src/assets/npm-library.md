# 🚀 Publishing a NPM library 

In this post I will explain how to bundle and publish a Typescript component library on NPM.

So I needed to create a component library for my work. Separating all the main components into a component library allows us to re-use it across projects and have better quality control.

I decided to write about what I found while learning how to create a component library and how to bundle and publish it to npm as a package.


## Create-react-app

I decided to use create-react-app (with the typescript template) to speed up the process. Even if I'm not creating a SPA, having already Babel, Webpack, Jest and hot reloading is a big head start.

    cd /project-folder
    npx create-react-app . --template typescript

We can then remove the files not related to those tools:

    rm src/App.css src/App.test.tsx src/App.tsx src/logo.svg \
      src/index.css src/index.tsx && rm -rf public/

## Building the library

There are many available options to build the library into a usable state, but since we are using typescript the simplest one is just using the tsc compiler to build the folder we will export on npm as our package. Another popular choice is rollup, if you are publishing a package without typescript I recommend looking it up.

If we set "noEmit: false" on the tsconfig.json tsc will output the compiled project into files. But if you just set noEmit to false on the tsconfig.json you will be greeted with this message the next time you run yarn tests:


    $ yarn test
    yarn run v1.22.5
    $ react-scripts test --watchAll=false
    The following changes are being made to your tsconfig.json file:
      - compilerOptions.noEmit must be true


...and react-scripts will automatically change noEmit to true again. One way to get around this is to create a separate tsconfig for building the project.


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


This extends the normal tsconfig, preferring the new values if the same attribute is declared.

So our build script on package.json becomes:
``"build": "tsc --build tsconfig.build.json"``

Most of the configuration can stay on the tsconfig.json, which will just be extended.

Here is the full tsconfig.json file:

##### tsconfig.json
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


Here is some explanation of the most important configurations for a library:

- ``declaration`` creates .d.ts files with types for every file, essential for other typescript projects to be able to use the library.

- ``sourceMap`` creates annotations for js files that tools like debuggers can use to better navigate the project

- ``declarationMap`` creates annotations similar to sourceMap but for the .d.ts files

The rest of the options are more related to what tsc considers an error and how it builds the code. You can learn more about each option on https://www.typescriptlang.org/tsconfig .

With this running ``yarn build`` will generate a /lib folder on the root of the project. That will be the folder we will be exposing as our npm package.

## Publishing on npm

Since we are compiling everything we want to publish into the /lib folder, we just need to add that as the directory on package.json and npm will ignore the rest (outside of the basic project files: package.json, README, CHANGELOG and LICENSE)

We also need to specify the entry point to our package, in this case '/lib/index.js'.

##### package.json

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

##### ps.: After running this command will you need to verify your email address to confirm your registration

    npm adduser


and publish our package:

    npm publish


If you get an 403 error, check to see if a package with the same name doesn't already exist and make sure to verify your email address.

And that's it! Now you can install your library anywhere using ``yarn add library-name``!


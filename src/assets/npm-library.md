# 🚀 How to publish a NPM library 

So I needed to create a component library for my work. Separating all the main components into a separeted library allow us to re-use it accross projects and have a better control of the theme and most re-used code.

I decided to write about what I found while learning how to create a component library and how bundle and publish it to npm as a package.

On this first post I will focus more on the building and publishing part of it, as it can be applied to a lot more cases thus being more useful.

I'm using Typescript for the library, and this is relevant since I will use typescript's compiler to generate the bundle for the npm package.

## Create-react-app

I decided to use create-react-app (with the typescript template) to speed up the proccess. Even if I'm not creating a SPA, having already Babel, Webpack, Jest and hot reloading is a big head start.

    cd /project-folder
    npx create-react-app . --template typescript

We can then remove most of the files not related to those tools:

    rm src/App.css src/App.test.tsx src/App.tsx src/logo.svg \
      src/index.css src/index.tsx && rm -rf public/

## Building the library

There are many available options to build the library into an usable state, but since we are using typescript the simplest one is just using the tsc compiler to build the folder we will export on npm as our package. The other popular choice I found was rollup, so if you are publishing a package without typescrit I recommend looking it up.

If we set "noEmit: false" on the tsconfig.json tsc will output the compiled project into a files. But if you just set noEmit to false on the tsconfig.json you will be greeted with this message the next time you run yarn tests:


    $ yarn test
    yarn run v1.22.5
    $ react-scripts test --watchAll=false
    The following changes are being made to your tsconfig.json file:
      - compilerOptions.noEmit must be true


And react-scripts will change noEmit to be true again. One way to get around that is to create a separated tsconfig for building the project and using that explicitly when building it.

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

The rest of the options are more related what tsc considers and error and how it builds the code. You can learn more about each option on https://www.typescriptlang.org/tsconfig .

With this running ``yarn build`` will generate a /lib folder on the root of the project. That will be the folder we will be exposing as our npm package.

## Publishing on npm

Since we are compiling everything we want to publish into the /lib folder, we just need to add that to our package.json and npm will ignore the rest (outside of the basic project files: package.json, README, CHANGELOG and LICENSE)

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

And that's it! Now you can install your library anywhere using ``yarn add library-name``!

If you get an 403 error, check to see if a package with the same name doesn't already exists and make sure to verify your email address.


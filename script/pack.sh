#!/bin/bash

cp -R ../images ../vss-extension.json .dist
cp -R ../uploadScript .dist/task
cp -p task.json package.json pnpm-lock.yaml .npmrc .dist/task 

chmod -R 700 node_modules
echo "installing packages for bundle"
(
 cd .dist/task && pnpm i -P
)

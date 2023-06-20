#!/bin/bash

cp -R ../images ../vss-extension.json .dist
cp -p task.json package.json npm-lock.yaml .npmrc ../uploadScript .dist/task 

echo "installing packages for bundle"
(
 cd .dist/task && pnpm i -P 
)
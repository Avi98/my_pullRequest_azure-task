#!/bin/bash

cp -R ../images .dist  
cp -p ../vss-extension.json .dist 
cp -p task.json .dist/task 
cp -p package.json .dist/task
cp -p pnpm-lock.yaml .dist/task
cp -p .npmrc .dist/task

echo "installing packages for bundle"
(
 cd .dist/task && pnpm i -P 
)
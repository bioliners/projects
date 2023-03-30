#!/bin/bash

GIT_HASH=`git rev-parse --short HEAD`
PROJECTS="core-lib seqdepot-lib mist-lib mist-api"
EXCLUDE="--exclude mist-api/src/docs/node_modules"
for p in $PROJECTS
do
  EXCLUDE+=" --exclude $p/node_modules"
done;

tar $EXCLUDE -zcf - bin/merge-deps.js _common/dep-merge.js $PROJECTS | docker build --build-arg GIT_HASH=${GIT_HASH} -t bioliners/mist-api:${GIT_HASH} -f mist-api/Dockerfile -

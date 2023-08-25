#!/bin/bash

cd mist-pg-db

GIT_HASH=`git rev-parse --short HEAD`
docker build --build-arg GIT_HASH=${GIT_HASH} -t bioliners/mist-pg-db:${GIT_HASH} .

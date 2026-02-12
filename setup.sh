#!/bin/bash

docker build -t judge-c docker/c
docker build -t judge-cpp docker/cpp
docker build -t judge-python docker/python

sqlite3 database.db < schema.sql

npm run build
npm run start

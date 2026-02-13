#!/bin/bash
set -e

build () {
  IMAGE_NAME=$1
  DOCKERFILE_PATH=$2

  if docker image inspect "$IMAGE_NAME" > /dev/null 2>&1; then
    echo "Image $IMAGE_NAME already exists. Skipping build."
  else
    echo "Building $IMAGE_NAME..."
    docker build -t "$IMAGE_NAME" "$DOCKERFILE_PATH"
  fi
}

build judge-c docker/c
build judge-cpp docker/cpp
build judge-python docker/python

if [ ! -f database.db ]; then
  echo "Initializing database..."
  sqlite3 database.db < schema.sql
else
  echo "Database already exists. Skipping initialization."
fi

npm run build
npm run start

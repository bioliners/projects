#!/bin/bash

set -e

if [[ ! -z "$BIOWONKS_VOLUMES" ]]; then
	for i in $BIOWONKS_VOLUMES; do
		echo "Setting ownership of ${i} to biowonks"
		chown biowonks:biowonks $i
	done
fi

if [[ $(whoami) = 'root' ]]; then
	su-exec biowonks "$@"
else
	exec "$@"
fi

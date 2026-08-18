#!/bin/sh
set -eu

test -s site/index.html
grep -q '<!doctype html>' site/index.html
grep -q 'CI/CD pipeline is working' site/index.html
grep -q 'deployed by Argo CD' site/index.html

echo "Static application smoke tests passed."

#!/bin/sh
# Build the V20.3.5 React app into ../public. Does not wipe public/data.
cd "$(dirname "$0")/../react" && npm run build

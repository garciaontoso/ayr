#!/bin/bash
cd "$(dirname "$0")"
wrangler pages deploy . --project-name=a-320poster --branch=main
echo "✅ Deployed to a320.onto-so.com"

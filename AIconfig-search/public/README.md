# public

Apache serves this directory. Node 20 writes the React build here (`index.html` and `assets/`). Python 3.11 writes the indexes under `data/`. Those generated files are not stored in git. Run `sh scripts/build_all.sh` and `sh scripts/deploy-react.sh` to fill this folder.

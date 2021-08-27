## SQL Language Server

please read [this](https://github.com/joe-re/sql-language-server).


# CCCS Fork Adding New Features

## Language Server

Language Server is a special kind of Visual Studio Code extension that powers the editing experience for many programming languages. With Language Servers, you can implement autocomplete, error-checking (diagnostics), jump-to-definition, and many other language features supported in VS Code.

More details found here https://code.visualstudio.com/api/language-extensions/language-server-extension-guide

JupyterLab leverages the VSCode Language Server extentions via this jupyterlab extension
https://github.com/krassowski/jupyterlab-lsp

Naturally `jupyterlab-lsp` supports the python language server.

This page shows the supported language servers
https://jupyterlab-lsp.readthedocs.io/en/latest/Language%20Servers.html

One of these is the `sql-language-srver`
https://github.com/joe-re/sql-language-server

The `sql-language-server` is able to syntax-highlith, lint and code-complete keywords.

Given a database schema it can also auto-complete column and table names. However it can only extract schema from the following database engines.

- MySQL
- PostgreSQL
- SQLite3


We have extended `sql-language-server` to support

- configuration via the JupyterLab advanced settings
- nested columns names using multi-part dot seperated paths
- loading schema and function information from json file, rather than having the `sql-language-server` connect to spark to retrieve the information, the idea is to use pyspark from the notebook, produce a json configuration file which the `sql-language-server` monitors for changes and loads. 
- visually distinct icons for `table`, `column`, `alias`, `functions` suggestions
- added support for code-completion of
	- functions including descriptions
	- table alias
	- table alias followed by dot
	- partially typed columns including multi-part fields (needed insertText)



## JupyterLab using sql-language-server 

JupyterLab finds modules to load using a LanguageServerManagerAPI.
In the logs you will see it look for a sql-language-server, it's looking for cli.js.
This is the method that finds the module

```
    def solve(self, mgr: LanguageServerManagerAPI):
        return mgr.find_node_module(self.node_module, *self.script)
```

In JupyterLab it's going to look for a 500 bytes cli.js script in the location `node_modules/sql-language-server/dist/bin/cli.js` and it will launch it a separate process which it will communicate with using stdio pipes.


JupyterLab logs you should see these lines
```
<LspStdIoReader(parent=<LanguageServerSession(language_server=sql-language-server, argv=['/usr/local/bin/node', '/Users/jccote/notebooks/node_modules/sql-language-server/dist/bin/cli.js', 'up', '--method', 'stdio'])>)> 

D 2021-08-06 10:37:37.104 ServerApp] Checking for /Users/jccote/notebooks/node_modules/sql-language-server/dist/bin/cli.js

[D 2021-08-06 10:42:50.690 ServerApp] [lsp] The following Language Servers will be available: {
      "sql-language-server": {
        "argv": [
          "/usr/local/bin/node",
          "--inspect-brk",
          "/Users/jccote/notebooks/node_modules/sql-language-server/dist/bin/cli.js",
          "up",
          "--debug",
          "--method",
          "stdio"
```

## Building sql-language-server from source code

Note: I replaced all package.json versions to fixed versions by removing the ^

```
$ git clone https://github.com/joe-re/sql-language-server.git
$ npm install in all packages (server, client) and also at the root
# at the root run
$ npm install

# build the sqlint package
$ cd packages/sqlint
$ npm run prepublish

# build it for jupyterlab
$ npm run prepublish
$ cd packages/server
$ npm run prepublish
```

JupyterLab installed the plugin in `~/notebooks/node_modules/sql-language-server`
# I'm replacing it with my build using a soft link
```
rm -rf ~/notebooks/node_modules/sql-language-server
ln -s  ~/node_modules/sql-language-server ~/notebooks/sql-language-server/packages/server/
```

I can now work on the packages/server code and rebuilt it as I need to
```
$ cd packages/server
$ npm run prepublish
```

# launching jupyter lab
```
cd ~/notebooks
$ jupyter lab --log-level=DEBUG > jupyterlab.log 2>&1
```

Note when you open a .sql file or a cell with `%%sql` you will see at the bottom of the JupyterLab's tray that it is starting language server. You will also notice in the terminal that a new node process is created. If you need to make changes to the code, rebuild the extension. Then you need to restart JupyterLab in order for it to launch node again and pickup the changes.


## Dubugging sql-language-server by attaching VSCode to the node process

Locally modified JupyterLab so that any node based language server can be attach to by a debugger

# Add `--inspect` so that you can attach to running process
```
vi /usr/local/lib/python3.9/site-packages/jupyter_lsp/specs/utils.py 
                "argv": [mgr.nodejs, '--inspect-brk', node_module, *self.args],
```
# Add `--inspect-brk` to suspend process and wait for debugger to attach to it
```
vi /usr/local/lib/python3.9/site-packages/jupyter_lsp/specs/utils.py 
                "argv": [mgr.nodejs, '--inspect-brk', node_module, *self.args],
```

Locally modified JupyterLab so that `sql-language-server` (built-in config for it) is launched in debug mode
# Adding --debug to launch configuration
```
vi /usr/local/lib/python3.9/site-packages/jupyter_lsp/specs/sql_language_server.py
    args = ["up", "--debug", "--method", "stdio"]
```

## Explanation of how `jupyterlab-lsp` hooks support for the `sql-language-server`
In JupyterLab if you open a file with `.sql` extension the `sql-language-server` kicks in.
In order for the `.sql` file handling to work `jupyterlab-lsp` has a built-in spec registration for .sql.
This same file also knows how to launch the `sql-langauge-server` process. See
https://github.com/krassowski/jupyterlab-lsp/blob/39010530eba400bffc56282709343e9fcf8bc778/python_packages/jupyter_lsp/jupyter_lsp/specs/sql_language_server.py


In JupyterLab if you edit a cell with an `%%sql` magic the sql-language-server kicks in.
In order for the `%%sql` magic is handled by a "transclusion" which is built into `jupyterlab-lsp`.
The transclusion stripts the `%%sql` and returns the remaining text a mimics a `.sql` file extension. See
https://github.com/krassowski/jupyterlab-lsp/blob/39010530eba400bffc56282709343e9fcf8bc778/packages/jupyterlab-lsp/src/transclusions/ipython-sql/extractors.ts



## VsCode IDE using sql-language-server 

VsCcode uses it's own extension mechanism. The `sql-language-server` project implements VsCode extension which acts as a client to the `sql-language-server` process. It also launches the process but does not use the same cli.js file as `jupyterlab-lsp` does.

In JupyterLab it's going to look for a 500 bytes cli.js script in the location `node_modules/sql-language-server/dist/bin/cli.js`. But in VsCode it will look for a file that is 4MB and located in `dist/cli.js`

To create this file you need to build your project differently.
```
# in packages/server
$ npm run vscode:prepublish
$ npm run prepare-vsc-extension
```

This will build a 4MB `dist/cli.js` file. This is how I soft link the original extension to by build directory.
```
$ cd ~/.vscode/extensions/joe-re.sql-language-server-0.12.0/packages/server/dist
$ mv cli.js cli.js.orig
$ ln -s  ~/notebooks/sql-language-server/packages/server/dist/cli.js cli.js
```

I had issues with spawn-sync, is it because of a newer version of npm? What I did to fix it is include the dependency in the project.
```
# at the root of the project
$ npm i spawn-sync
```

In VSCode if you open a file with `.sql` extension the `sql-language-server` kicks in. The `sql-language-server` project contains a VsCode extension which acts as a client. See
https://github.com/joe-re/sql-language-server/blob/e3fb90a694f9a5ddcfadd33478fca1bc21665ee3/packages/client/extension.ts

VsCode will call the `activate` method of this extension and it is this client which launches the `sql-language-server` process and which also sends custom LSP messages like `fixAllFixableProblems` and `rebuildSqlite3` to the server.




## Error Handling

Errors are logged in tmp file
`/System/Volumes/Data/private/var/folders/pq/6gfr5xpj7h5b455myr2z8j180000gn/T/sql-language-server.log`

However they don't seem to be sent to the calling application JupyterLab/VsCode. Not sure how to best report errors like failed to parse database schema file...


## Running Test Cases using Jest

```
cd ~/notebooks/sql-language-server/packages/server
npm run test
```





## oh-my-zsh
- install zsh
        ```
        sudo apt install zsh
        ```
- install oh-my-zsh
        ```
        sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
        ```
- update default shell
        ```
        chsh -s $(which zsh)
        pkill -KILL -u $USER
        ```

## golang
- wget https://go.dev/dl/go1.23.5.linux-amd64.tar.gz
- tar -xzf go1.23.5.linux-amd64.tar.gz 
- update .zshrc
        ```
        export GOROOT=/home/ubuntu/softwares/go
        export GOPATH=/home/ubuntu/workspace/gopath
        export GOBIN=$GOPATH/bin
        export PATH=$PATH:$GOROOT/bin
        ```
- update go env
        ```
        ```

## k8s
- kubectl
        https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/
- krew
        - download
                ```
                OS="$(uname | tr '[:upper:]' '[:lower:]')"
                ARCH="$(uname -m | sed -e 's/x86_64/amd64/' -e 's/\(arm\)\(64\)\?.*/\1\2/' -e 's/aarch64$/arm64/')"
                KREW="krew-${OS}_${ARCH}"
                curl -fsSLO "https://github.com/kubernetes-sigs/krew/releases/latest/download/${KREW}.tar.gz"
                tar zxvf "${KREW}.tar.gz"
                ```
        - env
                ```
                export KREW_ROOT=/home/ubuntu/softwares/krew
                export PATH=$PATH:$KREW_ROOT/bin
                alias k='kubectl'
                alias kcm='kubecm'
                alias kubecm='kubectl kc'
                ```
        - install
                ```
                export KREW_ROOT=/home/ubuntu/softwares/krew
                ./"${KREW}" install krew
                ```
        - install plugin
                ```
                kubectl krew install cm
                kubectl krew install ctx
                kubectl krew install ns
                kubectl krew install kc
                ```
- helm
        ```
        wget https://get.helm.sh/helm-v3.17.0-linux-amd64.tar.gz
        ```
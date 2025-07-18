---
publishDate: 2022-01-15T00:00:00Z
title: Raspberry Pi 4B 再战 All in One
---

# Raspberry Pi 4B 再战 All in One

## Install ZSH on Arch Linux / Manjaro

安装 ZSH：

```shell
yay -S zsh-git
```

安装 Zinit 和我常用的插件

```shell
sh -c "$(curl -fsSL https://git.io/zinit-install)"

echo 'zinit load zsh-users/zsh-syntax-highlighting
zinit load zsh-users/zsh-autosuggestions
zinit load  ael-code/zsh-colored-man-pages
zinit load agkozak/zsh-z
zinit ice depth=1; zinit light romkatv/powerlevel10k' >> ~/.zshrc
```

然后进入到 `zsh` 中，执行一次 `source ~/.zshrc`：

```shell
zsh

source ~/.zshrc
```


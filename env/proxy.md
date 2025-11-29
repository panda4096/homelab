- 下载clash
        wget --no-check-certificate https://dl.ssrss.club/clash-linux-amd64-v1.9.0.gz  
- 下载订阅配置
        wget -O config.yaml "https://ccccc.subc1.ktyjsq.com/sub?target=clash&udp=true&emoji=true&filename=%E5%BF%AB%E5%A1%94&url=https://ppp.ddd.ktyjsq.com/link/AlC3gWEOv1MUHy2w?sub=3&extend=1"
- 更新订阅配置
        wget --no-check-certificate -O config.yaml "https://ccccc.subc1.ktyjsq.com/sub?target=clash&udp=true&emoji=true&filename=%E5%BF%AB%E5%A1%94&url=https://ppp.ddd.ktyjsq.com/link/AlC3gWEOv1MUHy2w?sub=3&extend=1"
- 运行clash
        sudo ./clash -d . >> log &
- 开启代理
        export http_proxy=http://127.0.0.1:7890
        export https_proxy=http://127.0.0.1:7890
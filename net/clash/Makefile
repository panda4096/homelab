build-sidecar:
	docker build -t butcoder/clash-sidecar:latest -f Dockerfile.sidecar .

push-sidecar:
	docker push ybutcoder/clash-sidecar:latest


build-clash:
    docker build --platform linux/amd64 -t butcoder/clash:latest -f Dockerfile.clash .

push-clash:
	docker push butcoder/clash:latest


deploy: build-sidecar push-sidecar build-clash push-clash
	kubectl apply -f clash-configmap.yaml
	kubectl apply -f clash-deployment.yaml

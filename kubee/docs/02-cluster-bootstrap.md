# Cluster Bootstrap

## Lab Cluster

Run this on the control-plane node `10.191.0.40`:

```bash
sudo CONTROL_PLANE_IP=10.191.0.40 bash setup-k8s-control-plane.sh
```

Copy the join command printed at the end.

Run this on the worker node `10.191.0.38`:

```bash
sudo bash setup-k8s-worker.sh -- 10.191.0.40:6443 --token TOKEN --discovery-token-ca-cert-hash sha256:HASH
```

Verify from the control plane:

```bash
kubectl get nodes -o wide
kubectl get pods -A
```

## Kubeconfig

Only the control-plane node receives admin kubeconfig automatically.

If you want `kubectl` on a worker, copy the control-plane kubeconfig:

```bash
mkdir -p ~/.kube
ssh balajid@10.191.0.40 'sudo cat /etc/kubernetes/admin.conf' > ~/.kube/config
chmod 600 ~/.kube/config
kubectl get nodes
```

If `kubectl` shows `localhost:8080`, kubeconfig is missing or empty.

## Recreate a Worker

Use this only when you intentionally want to remove the node from its current cluster:

```bash
sudo kubeadm reset -f
sudo systemctl restart containerd kubelet
sudo rm -rf /etc/cni/net.d/*
rm -f ~/.kube/config
```

Then join it again with a fresh control-plane token.

Generate a new token on the control plane:

```bash
sudo kubeadm token create --print-join-command
```


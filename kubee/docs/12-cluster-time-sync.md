# Cluster Time Synchronization

Every Kubernetes node must use a consistent clock. GitLab webservice signs
short-lived tokens for Gitaly; a worker clock ahead of Gitaly can make project
pages fail with HTTP 500 and:

```text
permission denied: token's validity window is in future
```

Kubernetes certificates, Argo CD, CI jobs, distributed databases, and incident
timelines also depend on consistent time.

## Lab Design

- Internal time server: `hb-ws-pp05` (`10.191.0.38`)
- Clients: `dd-test.d2-india.com` (`10.191.0.37`) and
  `hb-ws-pc06.d2-india.com` (`10.191.0.40`)
- Allowed client network: `10.191.0.0/24`
- Preferred external source: `hb-ntphost-01.d2-india.com`

The corporate source was unreachable on 2026-08-17. The internal server
therefore uses Chrony's local reference at stratum 10 so every cluster node
still agrees. When the corporate source recovers, Chrony automatically prefers
the better upstream time.

This design keeps distributed authentication working, but an unsynchronized
local reference can drift from real UTC. Restore a reachable authoritative NTP
source as soon as the network team provides one.

## Install

Run on `10.191.0.38`:

```bash
cd /dd/git/kubee
sudo scripts/configure-cluster-time.sh server config/lab.env
```

Run on every other Kubernetes node:

```bash
cd /dd/git/kubee
sudo scripts/configure-cluster-time.sh client config/lab.env
```

The script saves the original configuration once as
`/etc/chrony.conf.kubee-pre-time-sync`, installs the managed configuration,
opens the NTP firewalld service on the server, steps client clocks when needed,
and verifies a normal synchronized state.

## Verify

```bash
timedatectl status
chronyc sources -n
chronyc tracking
kubectl get nodes
```

A client should show `10.191.0.38` with source state `^*`, and
`chronyc tracking` should show `Leap status: Normal`. Compare all nodes:

```bash
date -u -Ins
ssh NODE date -u -Ins
```

Differences should remain well below one second.

For GitLab, exercise an actual Gitaly read rather than testing only the sign-in
page:

```bash
kubectl exec -n gitlab deployment/gitlab-toolbox -- gitlab-rails runner \
  'p = Project.find_by_full_path("GROUP/PROJECT"); puts p.repository.root_ref'
```

## Troubleshooting

### Source shows `^?`

The source is unreachable or has not supplied usable samples:

```bash
chronyc activity
chronyc sources -n
getent hosts hb-ntphost-01.d2-india.com
sudo firewall-cmd --list-services
```

Check DNS, UDP port 123, routing, and the server's `allow` network.

### GitLab says token validity is in the future

Identify pod placement and compare the caller with Gitaly:

```bash
kubectl get pods -n gitlab \
  -l 'app in (webservice,sidekiq,toolbox,gitaly)' -o wide
kubectl exec -n gitlab deployment/gitlab-webservice-default \
  -c webservice -- date -u -Ins
kubectl exec -n gitlab gitlab-gitaly-0 -- date -u -Ins
```

Repair Chrony on the node; do not delete the repository or recreate GitLab.
Restarting or pinning GitLab merely hides the clock fault until another pod is
scheduled on that node.

### Roll back the managed configuration

```bash
sudo install -m 0644 /etc/chrony.conf.kubee-pre-time-sync /etc/chrony.conf
sudo systemctl restart chronyd
chronyc sources -n
```

Do not roll back if it would return the node to an unsynchronized clock.

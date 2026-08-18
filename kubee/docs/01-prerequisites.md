# Prerequisites

## Node Requirements

Minimum practical lab capacity:

| Resource | Minimum | Preferred |
| --- | --- | --- |
| CPU | 16 cores total | 24+ cores total |
| RAM | 32 GB total | 48-64 GB total |
| Disk | 300 GB SSD | 500 GB+ SSD |

GitLab, Harbor, Jenkins, and SonarQube are heavy together. If the worker is small, install one major service at a time and validate resource usage before continuing.

## Network Requirements

Required:

| Item | Lab value |
| --- | --- |
| Kubernetes API | `10.191.0.40:6443` |
| Control plane | `10.191.0.40` |
| Worker | `10.191.0.38` |
| DNS zone | `d2-india.com` |
| Pod CIDR | `192.168.0.0/16` |
| Service CIDR | `10.96.0.0/12` |

You also need a free LAN IP range for MetalLB. The range must not overlap with DHCP or static machine IPs.

Example:

```text
10.191.0.240-10.191.0.250
```

Confirm the real free range with the network owner before applying MetalLB.

## DNS Records

Create DNS records pointing to the MetalLB ingress IP.

Recommended records:

```text
gitlab.d2-india.com   A   <INGRESS_LB_IP>
harbor.d2-india.com   A   <INGRESS_LB_IP>
jenkins.d2-india.com  A   <INGRESS_LB_IP>
sonar.d2-india.com    A   <INGRESS_LB_IP>
argocd.d2-india.com   A   <INGRESS_LB_IP>
nexus.d2-india.com    A   <INGRESS_LB_IP>
```

For a lab without DNS control, add equivalent entries to `/etc/hosts` on client machines.

## Firewall Ports

Control plane:

```text
6443/tcp
2379-2380/tcp
10250/tcp
10257/tcp
10259/tcp
4789/udp
```

Worker:

```text
10250/tcp
30000-32767/tcp
30000-32767/udp
4789/udp
```

Ingress clients need access to ports `80/tcp` and `443/tcp` on the MetalLB ingress IP.


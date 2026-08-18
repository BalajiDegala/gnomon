# Main Server Replication

Use the lab cluster as the reference implementation. The main server should have the same folder structure, same install order, and same service DNS pattern.

## Prepare a Main Environment File

Create:

```bash
cp config/lab.env.example config/main.env
```

Change values for the main environment:

```bash
CLUSTER_NAME=d2-india-main
CONTROL_PLANE_IP=<MAIN_CONTROL_PLANE_IP>
WORKER_IPS=<MAIN_WORKER_IPS>
METALLB_ADDRESS_POOL=<MAIN_FREE_LAN_RANGE>
INGRESS_DOMAIN=d2-india.com
```

## Replication Checklist

1. Confirm static IPs and hostnames.
2. Confirm DNS records can be created under `d2-india.com`.
3. Confirm MetalLB IP pool is outside DHCP.
4. Bootstrap control plane.
5. Join workers.
6. Install foundation add-ons.
7. Confirm ingress external IP.
8. Create service DNS records.
9. Install Harbor.
10. Install GitLab.
11. Install Jenkins.
12. Install SonarQube.
13. Install Argo CD.
14. Deploy one demo app through GitOps.
15. Configure backup targets outside the cluster.

## What Must Differ Between Lab and Main

| Item | Why |
| --- | --- |
| Node IPs | Physical or VM addresses differ |
| MetalLB pool | Must be free in that LAN |
| Storage class and disk paths | Depends on attached disks |
| TLS issuer | Lab may use internal CA; main may use enterprise CA |
| Resource requests | Main server may need production-sized values |

## What Should Stay the Same

| Item | Reason |
| --- | --- |
| DNS naming pattern | Avoid environment-specific scripts |
| Namespaces | Easier support and backup policy |
| GitOps workflow | Same deployment behavior everywhere |
| Image tag rule | Commit SHA traceability |
| Install order | Reduces debugging complexity |


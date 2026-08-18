# Managed by kubee/scripts/configure-cluster-time.sh.
# Prefer the corporate source when it is available. The local reference keeps
# every Kubernetes node on one clock when that upstream source is unavailable.
server ${NTP_UPSTREAM_HOST} iburst

driftfile /var/lib/chrony/drift
makestep 1.0 3
rtcsync

allow ${NTP_ALLOW_CIDR}
local stratum 10

keyfile /etc/chrony.keys
ntsdumpdir /var/lib/chrony
leapsectz right/UTC
logdir /var/log/chrony

# Managed by kubee/scripts/configure-cluster-time.sh.
# Prefer the internal cluster clock. Keep the corporate source as an automatic
# higher-quality fallback when it becomes reachable again.
server ${NTP_SERVER_IP} iburst prefer
server ${NTP_UPSTREAM_HOST} iburst

driftfile /var/lib/chrony/drift
makestep 1.0 3
rtcsync

keyfile /etc/chrony.keys
ntsdumpdir /var/lib/chrony
leapsectz right/UTC
logdir /var/log/chrony

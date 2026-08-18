apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: d2-india-pool
  namespace: metallb-system
spec:
  addresses:
    - ${METALLB_ADDRESS_POOL}
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: d2-india-l2
  namespace: metallb-system
spec:
  ipAddressPools:
    - d2-india-pool


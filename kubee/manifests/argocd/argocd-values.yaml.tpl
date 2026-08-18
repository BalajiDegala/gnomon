global:
  domain: ${ARGOCD_HOST}
  # The lab service records are currently provided to hosts rather than by the
  # DNS server used by CoreDNS. Keep Git URLs canonical inside Argo CD while
  # routing that hostname to the shared ingress address.
  hostAliases:
    - ip: ${INGRESS_LB_IP}
      hostnames:
        - ${GITLAB_HOST}
  logging:
    format: text
    level: info
  networkPolicy:
    create: true
    defaultDenyIngress: false

configs:
  cm:
    url: https://${ARGOCD_HOST}
    admin.enabled: true
    exec.enabled: false
  params:
    server.insecure: true
  rbac:
    policy.default: role:readonly
    scopes: "[groups]"

# Enable this later when GitLab OIDC is configured.
dex:
  enabled: false

controller:
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: "1"
      memory: 1Gi

server:
  certificate:
    enabled: true
    domain: ${ARGOCD_HOST}
    duration: 8760h
    renewBefore: 720h
    issuer:
      group: cert-manager.io
      kind: ClusterIssuer
      name: ${ARGOCD_CERT_ISSUER}
    privateKey:
      rotationPolicy: Always
      encoding: PKCS1
      algorithm: RSA
      size: 2048
  service:
    type: ClusterIP
  ingress:
    enabled: true
    controller: generic
    ingressClassName: nginx
    hostname: ${ARGOCD_HOST}
    path: /
    pathType: Prefix
    tls: true
    annotations:
      nginx.ingress.kubernetes.io/backend-protocol: HTTP
      nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
      nginx.ingress.kubernetes.io/ssl-redirect: "true"
      nginx.ingress.kubernetes.io/proxy-body-size: 10m
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

repoServer:
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: "1"
      memory: 1Gi

applicationSet:
  resources:
    requests:
      cpu: 50m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 512Mi

notifications:
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 250m
      memory: 256Mi

redis:
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 500m
      memory: 256Mi

apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ${NFS_STORAGE_CLASS}
  annotations:
    storageclass.kubernetes.io/is-default-class: "false"
provisioner: nfs.csi.k8s.io
parameters:
  server: ${NFS_SERVER_IP}
  share: ${NFS_EXPORT_PATH}
  mountPermissions: "0770"
  # ReclaimPolicy Retain protects the PV after a PVC is removed. If an
  # administrator later changes the PV to Delete and removes it, delete the
  # corresponding NFS subdirectory as well.
  onDelete: delete
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: Immediate
mountOptions:
  - nfsvers=4.1
  - hard
  - timeo=600
  - retrans=2

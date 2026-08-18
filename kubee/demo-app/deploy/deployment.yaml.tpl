apiVersion: apps/v1
kind: Deployment
metadata:
  name: cicd-demo
  namespace: demo
  labels:
    app.kubernetes.io/name: cicd-demo
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: cicd-demo
  template:
    metadata:
      labels:
        app.kubernetes.io/name: cicd-demo
    spec:
      imagePullSecrets:
        - name: harbor-cicd-registry
      containers:
        - name: web
          image: __IMAGE__
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 80
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
            limits:
              cpu: 200m
              memory: 128Mi
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10

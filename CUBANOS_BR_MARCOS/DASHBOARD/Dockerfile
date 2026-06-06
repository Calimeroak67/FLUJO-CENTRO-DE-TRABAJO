FROM nginx:alpine
# syntax=docker/dockerfile:1
COPY index.html app.js /usr/share/nginx/html/
COPY config.template.js /etc/dashboard/config.template.js
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]

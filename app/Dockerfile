FROM nginx:alpine

COPY index.html  /usr/share/nginx/html/index.html
COPY basic.html  /usr/share/nginx/html/basic.html
COPY data.json   /usr/share/nginx/html/data.json
COPY css/        /usr/share/nginx/html/css/
COPY js/         /usr/share/nginx/html/js/
COPY nginx.conf  /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

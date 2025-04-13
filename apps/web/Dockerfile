FROM svenstaro/miniserve:alpine AS runner

RUN adduser -D www

COPY ./dist /app
RUN chown -R www:www /app

USER www

# 暴露端口
EXPOSE 8080

# 运行 miniserve
CMD ["--port", "8080", "--index", "index.html", "-v", "/app"]

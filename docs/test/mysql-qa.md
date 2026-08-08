## MySQL QA 验收

本流程只使用临时 MySQL 实例，不连接生产数据库，也不写入持久化卷。它覆盖：

- `prisma/migrations/mysql/0_init` 到当前最新迁移的 `prisma migrate deploy`；
- `AdminAuditLog` 与 `AdminAuditTarget` 的 UPDATE/DELETE 不可变触发器；
- 后台审计服务回归（`tests/admin-audit.service.test.ts`）；
- 媒体 reservation、缩略图/附件消费和过期清理回归（`tests/blog-assets.service.test.ts`）。

### CI

`.github/workflows/mysql-qa.yml` 使用 `mysql:8.4` service。service 只创建一个临时 `mutan_qa` 数据库，启用空 root 密码仅用于 CI 容器内测试；连接信息没有提交任何真实凭据。工作流通过 `pnpm run test:mysql-qa` 执行完整流程。

### 本地一次性容器

前置条件：Docker、Node.js、pnpm。下面的连接 URL 仅指向本机临时容器；不要把 `TEST_DATABASE_URL` 指向生产库或共享数据库。

```bash
export MYSQL_QA_CONTAINER=mutan-mysql-qa

docker run --name $MYSQL_QA_CONTAINER --rm --detach \
  --env MYSQL_DATABASE=mutan_qa \
  --env MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  --env MYSQL_ROOT_HOST=% \
  --publish 33060:3306 \
  mysql:8.4

trap 'docker stop $MYSQL_QA_CONTAINER >/dev/null 2>&1 || true' EXIT

until docker exec $MYSQL_QA_CONTAINER mysqladmin ping -h 127.0.0.1 -uroot --silent; do
  sleep 1
done

export DATABASE_PROVIDER=mysql
export TEST_DATABASE_URL=mysql://root@127.0.0.1:33060/mutan_qa
export MYSQL_QA_ALLOW_RESET=true

pnpm install --no-frozen-lockfile
pnpm run test:mysql-qa

docker stop $MYSQL_QA_CONTAINER
trap - EXIT
unset DATABASE_PROVIDER TEST_DATABASE_URL MYSQL_QA_ALLOW_RESET MYSQL_QA_CONTAINER
```

`run-mysql-qa.mjs` 会把 `DATABASE_URL` 强制设为 `TEST_DATABASE_URL`，并在第二个套件前执行一次 `prisma migrate reset --force --skip-seed`。因此 `MYSQL_QA_ALLOW_RESET=true` 只能用于上面的临时库；不要在生产或含有业务数据的数据库上运行。

容器使用 `--rm` 且没有挂载数据卷。测试结束后 `docker stop` 会移除容器；若命令中途失败，仍应执行 `docker stop $MYSQL_QA_CONTAINER` 清理，并用 `docker ps -a --filter name=mutan-mysql-qa` 确认没有残留。

### 版本与结果记录

验收时记录以下证据，不要记录密码或完整带凭据 URL：

```bash
docker image inspect mysql:8.4 --format '{{.RepoTags}} {{.Id}}'
node --version
pnpm --version
pnpm run test:mysql-qa
```

成功输出的最后一行应为：

```text
MySQL QA 通过：迁移、审计不可变触发器、媒体 reservation 回归均已执行。
```

若执行环境没有 Docker/MySQL，使用 CI workflow 或由具备临时 MySQL 权限的 QA 环境执行上述同一 runner；不要把静态迁移检查当作实例级验收证据。

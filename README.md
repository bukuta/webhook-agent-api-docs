# webhook-agent-api-docs webhook-agent项目接口文档

## 文档基于OpenApi3.0，
具体OpenApi3.0规范 (https://swagger.io/specification/)

## 使用方法

```bash
 # clone本项目后，进入项目目录
 git clone https://github.com/bukuta/webhook-agent-api-docs.git && cd webhook-docs 
 # 安装npm
 npm install
 # 开启实时编译
 npm watch
 # ...编辑文档
 # 开始预览
 npm run preview
 # 将会启动服务并打开浏览器，看到完整的文档
 # 然后每次修改文档后，手动刷新浏览器页面
```

## 文件拆分：
在使用编写api文档过程中发现因为项目中接口数量多，文件很容易就超过3000行，不易编辑和维护。

### 拆分方法：
使用nodejs将拆分的独立的yaml解析成json, 再由js拼到一起，最终输出完整的yaml文件，供swaggerUI 渲染使用，方便查阅

### 文件拆分后的目录结构
```
.
├── dist/
│   ├── index.json
│   ├── index.yaml
│   ├── mock.responses.json
│   └── mock.schemas.json
├── scripts/
│   ├── EasyMockClient.js
│   ├── build.js
│   ├── preview.js
│   └── sync.js
├── src/
│   ├── components/
│   │   ├── requestBodies/
│   │   │   └── omitId.yaml
│   │   ├── responses/
│   │   │   ├── 200.array.yaml
│   │   │   ├── 200.yaml
│   │   │   ├── 201.yaml
│   │   │   ├── 204.yaml
│   │   │   ├── 400.error.yaml
│   │   │   ├── 401.yaml
│   │   │   ├── 403.yaml
│   │   │   ├── 404.yaml
│   │   │   └── 405.yaml
│   │   └── schemas/
│   │       ├── Action.yaml
│   │       ├── Admin.yaml
│   │       ├── Branches.yaml
│   │       ├── Hook.yaml
│   │       ├── Log.yaml
│   │       ├── Plan.yaml
│   │       ├── Project.yaml
│   │       ├── Site.yaml
│   │       ├── Task.yaml
│   │       └── meta.yaml
│   ├── paths/
│   │   ├── actions.yaml
│   │   ├── admins.yaml
│   │   ├── hooks.yaml
│   │   ├── projects.yaml
│   │   ├── tasks.yaml
│   │   └── user.yaml
│   ├── main.yaml
│   └── tags.yaml
├── README.md
├── nodemon.json
├── package-lock.json
└── package.json

```
## 结构复用

> OpenApi3.0定义的复用结构是基于YAML的复用机制本身，相对较弱，只能使用$ref做全量替换，无法局部替换

### 定义新的语法

> 定义统一的返回结构，由具体的实体数据作为填充

```yaml
‘@#/components/response/200’:
  '@item': '#/components/schemas/Admin'

'@#/components/response/401': true

```


说明：
- dist为输出目录,内部有完整的snc.yaml文件和snc.json
- scripts为脚本文件，由npm scripts调用
- src 中保存源文档，主体为main.yaml, 包含基本信息，tags.yaml为全部的tag定义列表，`paths/`中定义了全部的paths, 并按资源或者业务分类, components中定义了可复用的实体(Schemas)或者response模板或者requestBodies

编写文档时，可执行`npm run watch`实时编译，或者每次手动执行`npm run build`


## 其他：
为实体(Schema)和Response定义mock数据 : 通过`x-mock`字段
```yaml
Log:
  type: object
  description: 日志
  properties:
    id:
      type: integer
      format: int32
      x-mock: '@integer'
    content:
      type: string
      x-mock: '@cparagraph'
    task:
      type: integer
      x-mock: '@integer'

    createAt:
      type: string
      format: date-time
      x-mock: '@datetime'
    updateAt:
      type: string
      format: date-time
      x-mock: '@datetime'
```

## npm run mock

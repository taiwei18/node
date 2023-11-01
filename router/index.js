const express = require('express');
const app = express();
const cors = require('cors');
const multer = require("multer");
const multiparty = require('multiparty');
const xlsx = require("xlsx");
const https = require('https');
/* 
nodejieba
cut:精准模式;
cutAll:全模式;
load:加载默认字典;
extract:关键词提取;
*/
const { cut, cutAll, load, extract } = require("nodejieba");
load();

app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization', 'x-requested-with');
    next();
});
app.use(cors({
    allowedHeaders: ['Content-Type', 'x-requested-with'] // 添加允许的请求头字段
}));
const upload = multer({ dest: "temp/" });

app.get('/', (req, res) => {
    res.send('Hello, World!');
});
// 统一返回格式
const formData = (data = [], code = 200, msg = '成功') => {
    return {
        code: code,
        data: data,
        msg: msg,
    }
}
//excel解析上传
/**
 * @api {post} http://localhost:3000/upload excel解析上传
 * @apiDescription excel解析上传
 * @apiName submit-login
 * @apiGroup upload
 * @apiParam (body) {String} file file
 * @apiParamExample {json} Request-Example
 *  {
 *    "file": "file"
 *  }
 * @apiUse respSuccessModel
 * @apiVersion 1.0.0
 */
app.post("/upload", (req, res) => {
    //利用multiparty中间件获取文件数据
    let uploadDir = './'

    let form = new multiparty.Form()
    form.uploadDir = uploadDir
    form.keepExtensions = true; //是否保留后缀
    form.parse(req, function (err, fields, files) {
        const sql = req.app.locals.request;
        const filePath = files.file[0].path;
        const workbook = xlsx.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);
        // jsonData.forEach((res) => {
        //     res.keywords = res.keywords?.replace(/\n/g, "").replace(/\s/g, "");
        //     sql.query(`insert into product values('${res.product_name}','${res.keywords}','${res.sensitive_words ? res.sensitive_words : ''}','${res.answer}')`)
        // })
        res.send(formData(jsonData));
    })

});
//将excel数据保存到数据库
app.post('/saveExcel', (req, res) => {
    const sql = req.app.locals.request;
    const { data } = req.body;
    data.forEach((res) => {
        res.keywords = res.keywords?.replace(/\n/g, "").replace(/\s/g, "");
        sql.query(`insert into product values('${res.product_name}','${res.keywords}','${res.sensitive_words ? res.sensitive_words : ''}','${res.answer}')`)
    })
    res.send(formData(data));
})
//导出excel
app.get('/exportProduct', (req, res) => {
    const sql = req.app.locals.request;
    sql.query('select * from product', (err, result) => {
        //生成
        const worksheet = xlsx.utils.json_to_sheet(result.recordset);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet 1');
        xlsx.writeFile(workbook, 'data.xlsx');
        if (result) res.send(formData(result));
    });
});
//获取product表数据
app.get('/products', (req, res) => {
    const sql = req.app.locals.request;
    sql.query('select * from product', (err, result) => {
        if (result) res.send(formData(result));
    });
});

//修改product表数据
app.post('/updateproduct', (req, res) => {
    const sql = req.app.locals.request;
    const { id, product_name, keywords, sensitive_words, answer } = req.body;
    const updateFields = [];
    if (product_name) updateFields.push(`product_name='${product_name}'`);
    if (keywords) updateFields.push(`keywords='${keywords}'`);
    if (sensitive_words) updateFields.push(`sensitive_words='${sensitive_words}'`);
    if (answer) updateFields.push(`answer='${answer}'`);
    const updateStatement = `UPDATE product SET ${updateFields.join(', ')} WHERE id=${id}`;
    sql.query(updateStatement, (err, result) => {
        if (err) res.send(formData(202, err, '失败'));
        res.send(formData(result));
    })
})
//搜索product表里的关键字
app.post('/search', (req, res) => {
    const sql = req.app.locals.request;
    const { keywords } = req.body;
    sql.query(`select * from product where keywords like '%${keywords}%'`, (err, result) => {
        console.log(result);
        if (result) {
            res.send(formData(result));
        }
    })
})

//bing搜索
app.post('/bing', (req, res) => {
    const { query } = req.body;
    seadBing(query).then(data => {
        res.send(formData(data));
    }).catch(error => {
        console.error(error);
    });
})


//必应搜索
function seadBing(query) {
    return new Promise((resolve, reject) => {
        let data = []
        https.get({
            hostname: 'api.bing.microsoft.com',
            path: '/v7.0/search?q=' + encodeURIComponent(query),
            headers: {
                'Accept-Language': 'zh-CN,zh;q=1',
                'Ocp-Apim-Subscription-Key': 'f8d3860ee66f4378b0739b389e7176f1'
            },
        }, result => {
            let body = ''
            result.on('data', part => body += part)
            result.on('end', async () => {
                for (var header in result.headers) {
                    if (header.startsWith("bingapis-") || header.startsWith("x-msedge-")) {
                        console.log(header + ": " + result.headers[header])
                    }
                }
                data = await JSON.parse(body).webPages.value
                resolve(data)
            })
            result.on('error', e => {
                reject(e)
            })
        })
    })

}
//排序算法
function sortWord(params) {

}
//客服智能对话
app.post('/dialogue', async (req, res) => {
    const sql = req.app.locals.request;
    const { product, issue } = req.body;
    const keywords = cut(issue) || []
    const keyword = extract(issue, 4)
    sql.query(`select * from product where product_name='${product}'`, (err, result) => {
        if (result) {
            const wordList = result.recordset;
            let wordCut = []
            wordList.forEach((item) => {
                wordCut.push({
                    id: item.id,
                    product_name: item.product_name,
                    word: cut(item.keywords),
                    sensitive_words: cut(item.sensitive_words)
                })
            })
            let matchedWords = []
            const handelMatch = (res) => {
                for (let index = 0; index < wordCut.length; index++) {
                    const element = wordCut[index];
                    const isMatch = res.filter(word => element.word.includes(word))
                    const isMatch2 = res.filter(word => element.sensitive_words.length > 0 ? element.sensitive_words.includes(word) : true)
                    if (isMatch2.length > 0) {
                        if (isMatch.length > 0) {
                            element.word.forEach(() => {
                                matchedWords.push({
                                    id: element.id
                                })
                            })
                        }

                    }
                }
            }
            handelMatch(keywords)
            //去除matchedWords重复的id
            matchedWords = Array.from(new Set(matchedWords.map(item => item.id)))
            //返回的数据
            let rankData = []
            let resultData = []
            matchedWords.map((item2) => {
                for (let index = 0; index < wordList.length; index++) {
                    const element = wordList[index];
                    if (element.id === item2) {
                        rankData.push({
                            id: element.id,
                            product_name: element.product_name,
                            keywords: element.keywords,
                            sensitive_words: element.sensitive_words,
                            word: element.answer
                        })
                    }
                }
            })
            console.log(rankData);
            //关键词敏感词提取出来权重最高的比对——效果一般，暂时不用
            for (let index = 0; index < rankData.length; index++) {
                const element = rankData[index];
                const isKeywords = keyword.filter(word => element.keywords.includes(word.word))
                const isSensitive_words = keyword.filter(word => element.sensitive_words?.includes(word.word))
                if (isSensitive_words.length > 0) {
                    resultData.push(element)
                }
                if (isKeywords.length > 0) {
                    resultData.push(element)
                }
            }
            if (keywords.length === 0 && result) {
                return res.send(formData({
                    type: 6,
                    word: result.recordset
                }));
            }
            if (rankData.length === 0) {
                return res.send(formData({
                    type: 0,
                    word: ['抱歉，没有找到相关问题']
                }));
            }
            return res.send(formData({
                type: rankData.length > 1 ? 2 : -1,
                word: rankData
            }));
        }
    })
    sql.query('select * from product', (err, result) => {

    })

});

module.exports = app//导出
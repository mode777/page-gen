#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const doT = require("dot");
const marked = require("marked");
const _ = require("underscore");
const glob = require("glob");
const mkdirp = require("mkdirp");
const hljs = require("highlight.js");
const fsx = require("fs-extra");
const chokidar = require("chokidar");
const program = require("commander");
doT.templateSettings.strip = false;
const CONFIG_DEFAULT = {
    prefix: "/",
    out: "out",
    layout: "layout",
    content: "content",
    assets: "assets"
};
let cli = program
    .command("page-gen")
    .description("Creates a new website for given directory or working directory")
    .arguments("[root]")
    .option('-w, --watch', 'watch mode')
    .version('1.1.9')
    .parse(process.argv);
const ROOT = (cli.args[0] ? path.join(process.cwd(), cli.args[0]) : process.cwd());
const WATCH = cli["watch"];
const CONFIG = _.extend({}, CONFIG_DEFAULT, fs.existsSync(path.join(ROOT, "page.config.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "page.config.json"), "utf8")) : {});
// set paths
const CONTENT = path.join(ROOT, CONFIG.content);
const LAYOUT = path.join(ROOT, CONFIG.layout);
const OUT = path.join(ROOT, CONFIG.out);
const ASSETS = path.join(ROOT, CONFIG.assets);
if (WATCH) {
    if (path.relative(ROOT, OUT)[0] != ".")
        throw "Watch mode is not supported if out directory is within root. Try to configure the 'out' options in page.config.json";
    let build = false;
    let watcher = chokidar.watch(ROOT, { persistent: true });
    let callback = (f) => {
        build = true;
        setTimeout(() => {
            if (build) {
                try {
                    console.log("Rebuilding... " + new Date());
                    main(ROOT, CONTENT, LAYOUT, ASSETS, OUT, CONFIG, WATCH);
                }
                catch (e) {
                    console.error(e);
                    console.error("Build not successfull");
                }
                build = false;
            }
        }, 1000);
    };
    watcher
        .on('add', callback)
        .on('change', callback)
        .on('unlink', callback)
        .on('error', callback);
}
else {
    main(ROOT, CONTENT, LAYOUT, ASSETS, OUT, CONFIG, WATCH);
}
function main(ROOT, CONTENT, LAYOUT, ASSETS, OUT, CONFIG, isWatching) {
    // collect files
    const CONTENT_FILES = glob.sync(path.join(CONTENT, "**/*.*"));
    const LAYOUT_FILES = glob.sync(path.join(LAYOUT, "**/*.*"));
    const ASSET_FILES = glob.sync(path.join(ASSETS, "**/*.*"));
    // Create page-templates
    function createPage(filename) {
        let page = {
            path: filename,
            rawContent: fs.readFileSync(filename, "utf8"),
            name: path.basename(filename).replace(/\.[^/.]+$/, ""),
            filename: path.basename(filename),
            folder: path.dirname(filename),
            ext: path.extname(filename),
            userData: {}
        };
        page.isMarkdown = page.ext.toLocaleUpperCase() == ".MD";
        if (page.isMarkdown)
            page.ext = ".html";
        page.template = doT.template(page.rawContent, null, page.userData);
        page.outPath = path.join(path.relative(CONTENT, page.folder), page.name + page.ext);
        page.href = CONFIG.prefix + page.outPath;
        return page;
    }
    const CONTENT_PAGES = CONTENT_FILES.map(createPage);
    const LAYOUT_PAGES = LAYOUT_FILES.map(createPage);
    // Build layout graph
    const LAYOUTS_BY_NAME = {};
    LAYOUT_PAGES.forEach(x => LAYOUTS_BY_NAME[x.name] = x);
    LAYOUT_PAGES.forEach(x => x.layout = LAYOUTS_BY_NAME[x.userData.$layout]);
    CONTENT_PAGES.forEach(x => x.layout = LAYOUTS_BY_NAME[x.userData.$layout]);
    function renderLayout(layout, data, content) {
        data["$content"] = content;
        let newContent = layout.template(data);
        if (layout.layout)
            return renderLayout(layout.layout, data, newContent);
        else
            return newContent;
    }
    // clear output folder
    if (fs.existsSync(OUT)) {
        function clearDir(inputPath, keepFolder = false) {
            fs.readdirSync(inputPath).forEach((fileOrFolder) => {
                var filePath = path.join(inputPath, fileOrFolder);
                if (fs.statSync(filePath).isFile())
                    fs.unlinkSync(filePath);
                else
                    clearDir(filePath);
            });
            if (!keepFolder)
                fs.rmdirSync(inputPath);
        }
        clearDir(OUT, true);
    }
    // copy assets
    ASSET_FILES.forEach(inputPath => {
        let targetPath;
        if (path.basename(inputPath).toLowerCase() === "favicon.ico")
            targetPath = path.join(OUT, path.basename(inputPath));
        else
            targetPath = path.join(OUT, path.relative(ROOT, inputPath));
        mkdirp.sync(path.dirname(targetPath));
        fsx.copySync(inputPath, targetPath);
    });
    // render pages
    marked.setOptions({
        highlight: (code, lang) => {
            let res;
            if (!lang)
                res = hljs.highlightAuto(code).value;
            else
                res = hljs.highlight(lang, code).value;
            return res;
        }
    });
    function renderPage(page) {
        let subst = null;
        let abort = null;
        console.log(page.path);
        const TEMPLATE_DATA = createTemplateData(page);
        TEMPLATE_DATA["subst"] = (page) => subst = page;
        TEMPLATE_DATA["abort"] = () => abort = true;
        let html = "";
        if (page.template)
            html = page.template(TEMPLATE_DATA);
        if (page.isMarkdown)
            html = marked.parse(html);
        if (page.layout)
            html = renderLayout(page.layout, TEMPLATE_DATA, html);
        if (subst != null) {
            var extended = _.extend({}, subst);
            extended.href = page.href;
            extended.outPath = page.outPath;
            extended.userData = _.extend({}, subst.userData, page.userData);
            return renderPage(extended);
        }
        if (abort != null)
            return null;
        return html;
    }
    function createTemplateData(page, userData) {
        return {
            $page: page,
            $model: userData || page.userData,
            $layouts: LAYOUTS_BY_NAME,
            $pages: CONTENT_PAGES,
            $config: CONFIG,
            href: (rel) => path.normalize(path.join(CONFIG.prefix, rel)).replace(/\\/g, "/"),
            asset: (rel) => path.normalize(path.join(CONFIG.prefix, CONFIG.assets, rel)).replace(/\\/g, "/"),
            renderLayout: function (layout, userData) {
                LAYOUTS_BY_NAME[layout].template(createTemplateData(page, userData));
            },
            renderPage: renderPage,
        };
    }
    for (let i = 0; i < CONTENT_PAGES.length; i++) {
        var html = renderPage(CONTENT_PAGES[i]);
        if (html) {
            const filename = path.join(OUT, CONTENT_PAGES[i].outPath);
            mkdirp.sync(path.dirname(filename));
            fs.writeFileSync(filename, html);
        }
    }
    console.log("Done");
    if (!isWatching)
        process.exit();
}
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUEseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QiwyQkFBMkI7QUFDM0IsaUNBQWlDO0FBRWpDLGdDQUFnQztBQUNoQyw2QkFBNkI7QUFDN0IsaUNBQWlDO0FBQ2pDLHFDQUFxQztBQUNyQyxnQ0FBZ0M7QUFDaEMscUNBQXFDO0FBQ3JDLHFDQUFxQztBQUVyQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztBQVVuQyxNQUFNLGNBQWMsR0FBVztJQUMzQixNQUFNLEVBQUUsR0FBRztJQUNYLEdBQUcsRUFBRSxLQUFLO0lBQ1YsTUFBTSxFQUFFLFFBQVE7SUFDaEIsT0FBTyxFQUFFLFNBQVM7SUFDbEIsTUFBTSxFQUFFLFFBQVE7Q0FDbkIsQ0FBQTtBQW1CRCxJQUFJLEdBQUcsR0FBRyxPQUFPO0tBQ2QsT0FBTyxDQUFDLFVBQVUsQ0FBQztLQUNuQixXQUFXLENBQUMsZ0VBQWdFLENBQUM7S0FDN0UsU0FBUyxDQUFDLFFBQVEsQ0FBQztLQUNuQixNQUFNLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQztLQUNuQyxPQUFPLENBQUMsT0FBTyxDQUFDO0tBQ2hCLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFFdkIsTUFBTSxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztBQUNuRixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7QUFFM0IsTUFBTSxNQUFNLEdBQVcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxF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
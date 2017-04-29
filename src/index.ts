import * as fs from "fs";
import * as path from "path";
import * as doT from "dot";
import * as marked from "marked";
import * as util from "util";
import * as _ from "underscore";
import * as glob from "glob";
import * as mkdirp from "mkdirp";

doT.templateSettings.strip = false;

interface Config {
    prefix: string;
    out: string;
    layout: string;
    content: string;
    assets: string;
}

const CONFIG_DEFAULT: Config = {
    prefix: "/",
    out: "out",
    layout: "layout",
    content: "content",
    assets: "assets"
}

type template = (data: any) => string;

interface Page {
    rawContent?: string;
    path?: string;
    name?: string;
    filename?: string;
    ext?: string;
    folder?: string;
    template?: template;
    userData?: any;
    isMarkdown?: boolean;
    layout?: Page; 
    outPath?: string;
    href?: string;
}

function main(){

    // set paths
    const ROOT = (process.argv[2] ? path.join(process.cwd(), process.argv[2]) : process.cwd()); 
    
    const CONFIG = <Config>_.extend({}, CONFIG_DEFAULT, fs.existsSync(path.join(ROOT, "page.config.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "page.config.json"), "utf8")) : {});
    
    const CONTENT = path.join(ROOT, CONFIG.content);
    const LAYOUT = path.join(ROOT, CONFIG.layout);
    const OUT = path.join(ROOT, CONFIG.out);
    const ASSETS = path.join(ROOT, CONFIG.assets);

    // collect files
    const CONTENT_FILES = glob.sync(path.join(CONTENT, "**/*.*")); 
    const LAYOUT_FILES = glob.sync(path.join(LAYOUT, "**/*.*")); 
    const ASSET_FILES = glob.sync(path.join(ASSETS, "**/*.*"));

    // Create page-templates
    function createPage(filename: string): Page {
        let page: Page = {
            path: filename,
            rawContent: fs.readFileSync(filename, "utf8"),
            name: path.basename(filename).replace(/\.[^/.]+$/, ""),
            filename: path.basename(filename),
            folder: path.dirname(filename),
            ext: path.extname(filename),
            userData: {}
        }

        page.isMarkdown = page.ext.toLocaleUpperCase() == ".MD"; 
        page.template = doT.template(page.rawContent, null, page.userData);
        page.outPath = path.join(path.relative(CONTENT, page.folder), page.name + ".html");
        page.href = CONFIG.prefix + page.outPath;

        return page;
    }

    const CONTENT_PAGES = <Page[]>CONTENT_FILES.map(createPage);
    const LAYOUT_PAGES = <Page[]>LAYOUT_FILES.map(createPage);

    // Build layout graph
    const LAYOUTS_BY_NAME = {};
    LAYOUT_PAGES.forEach(x => LAYOUTS_BY_NAME[x.name] = x);

    LAYOUT_PAGES.forEach(x => x.layout = LAYOUTS_BY_NAME[x.userData.$layout]);
    CONTENT_PAGES.forEach(x => x.layout = LAYOUTS_BY_NAME[x.userData.$layout]);

    function renderLayout(layout: Page, data: any, content: string){
        data["$content"] = content;
        let newContent = layout.template(data);

        if(layout.layout)
            return renderLayout(layout.layout, data, newContent);
        else
            return newContent;
    }

    // clear output folder
    function clearDir(inputPath: string, keepFolder = false){
        fs.readdirSync(inputPath).forEach((fileOrFolder) => {
        var filePath = path.join(inputPath, fileOrFolder);
          if (fs.statSync(filePath).isFile())
            fs.unlinkSync(filePath);
          else
            clearDir(filePath);
        });
        if(!keepFolder)
            fs.rmdirSync(inputPath);
    }
    clearDir(OUT, true);    
    
    // copy assets
    ASSET_FILES.forEach(inputPath => {
        let targetPath = path.join(OUT, path.relative(ROOT, inputPath));
        mkdirp.sync(path.dirname(targetPath));
        fs.createReadStream(inputPath).pipe(fs.createWriteStream(targetPath));
    });

    // render pages
    function renderPage(page: Page){
        let subst = null;
        let abort = null;

        console.log(page.path);
        const TEMPLATE_DATA = createTemplateData(page);
        TEMPLATE_DATA["subst"] = (page) => subst = page; 
        TEMPLATE_DATA["abort"] = () => abort = true; 

        let html = "";
        if(page.template)
            html = page.template(TEMPLATE_DATA);

        if(page.isMarkdown)
            html = marked.parse(html);

        if(page.layout)
            html = renderLayout(page.layout, TEMPLATE_DATA, html);

        if(subst != null){
            var extended = <Page>_.extend({}, subst);
            extended.href = page.href;
            extended.outPath = page.outPath;
            extended.userData = _.extend({},subst.userData, page.userData);
            return renderPage(extended);
        }

        if(abort != null)
            return null;

        return html;
    }

    function createTemplateData(page: Page, userData?: any){
        return {
            $page: page,
            $model: userData || page.userData,
            $layouts: LAYOUTS_BY_NAME,
            $pages: CONTENT_PAGES,
            $config: CONFIG,
            href: (rel: string) => path.normalize(path.join(CONFIG.prefix, rel)).replace(/\\/g, "/"),
            asset: (rel: string) => path.normalize(path.join(CONFIG.prefix, CONFIG.assets, rel)).replace(/\\/g, "/"),
            renderLayout: function(layout: string, userData?: any){
                LAYOUTS_BY_NAME[layout].template(createTemplateData(page, userData))
            },
            renderPage: renderPage,
        }
    }

    for (let i = 0; i < CONTENT_PAGES.length; i++) {
        var html = renderPage(CONTENT_PAGES[i]);
        
        if(html){
            const filename = path.join(OUT, CONTENT_PAGES[i].outPath);
            mkdirp.sync(path.dirname(filename));
            fs.writeFileSync(filename, html);
        }
    }
    console.log("Done");
};

main();

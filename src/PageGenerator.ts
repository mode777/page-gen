import * as fs from "fs";
import * as path from "path";
import * as doT from "dot";
import * as marked from "marked";

export type template = (data: any) => string;

export abstract class Page {
    
    private _inputExtension: string;

    protected _template: template;
    protected _inputFilename: string;
    protected _inputName: string;
    protected _inputFolder: string;

    constructor(private _path: string){
        this._inputFilename = path.basename(_path);
        this._inputExtension = path.extname(this._inputFilename);
        this._inputName = this._inputFilename.replace(/\.[^/.]+$/, "");
        this._inputFolder = path.dirname(this._path);
    }

    public load(){
        let str = fs.readFileSync(this._path, "utf-8");
        if(this._inputExtension.toUpperCase() === ".MD")
            str = this._transformMarkdown(str);

        this._template = this._compile(str);
    }

    protected abstract _compile(html: string): template;

    private _transformMarkdown(md: string): string {
        return marked.parse(md);
    }

}

export class Layout extends Page  {
    
    constructor(path: string, private _parent: Layout = null){
        super(path);
    }
    
    render(content: string, inputData: any = {}){
        inputData["$content"] = content;
        content = this._template(inputData);

        if(this._parent)
            return this._parent.render(content, inputData);
        else
            return content;
    }

    protected _compile(html: string){
        return doT.template(html, { strip: false });
    }
}

export class ContentPage extends Page {
    
    private _pageData: any = {};
    private _targetDir: string;
        
    constructor(inputPath: string, basePath: string, targetPath: string, private _layoutLocator: (name: string) => Layout){
        super(inputPath);

        let rel = path.relative(basePath, inputPath);
        this._targetDir = path.join(targetPath, rel);
    }

    generate(globalData: any = {}){
        const content = this._render(globalData);
        this._write(content);
    }

    protected _render(globalData = {}){
        const data = new TemplateData(globalData, this._pageData);

        let content = this._template(data);
        
        if(this._pageData["$layout"]){
            content = this
                ._layoutLocator(this._pageData["$layout"])
                .render(content, data);
        }

        return content;
    }

    protected _write(content: string){
        fs.writeFileSync(path.join(this._targetDir, this._getTargetName()), content);        
    }     

    protected _compile(html: string){
        return doT.template(html, { strip: false }, this._pageData);
    }

    private _getTargetName(){
        if(this._pageData["$filename"]){
            return this._pageData["$filename"]
        }
        else {
            return this._inputName + ".html";
        }
    }
}

export class SiteGenerator {
    private _pages: ContentPage[] = [];

    constructor(private _targetDir: string, private _siteData: any = {}){

    }

    generate(){
        this._clearFolder();
        this._renderPages();
    }

    private _clearFolder(){
        
    }

    private _renderPages(){
        let counter = 0;
        while(counter < this._pages.length){
            let page = this._pages[counter];
            page.render(this._siteData);
            page.write();
            counter++;
        }
    }

}

class TemplateData {
    constructor(public $site: any, public $page: any){

    }
}
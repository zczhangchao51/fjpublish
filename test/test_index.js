const expect = require('chai').expect;
const Fjpublish = require('../lib/index.js');
const { mergeNoUndefined, extend } = Fjpublish;

Fjpublish.logger.error = function(msg) {
    throw new Error(msg);
};

describe('index', () => {

    it('Fjpublish.mergeNoUndefined', () => {
        expect(mergeNoUndefined(1, true, undefined, false)).to.equal(false);
        expect(mergeNoUndefined(true, '', 0, undefined)).to.equal(0);
    });

    it('Fjpublish.extend', () => {
        expect(extend({}, { a: 1, b: 2, c: 3 }, { a: undefined, b: 4, d: 5 })).to.deep.equal({ a: 1, b: 4, c: 3, d: 5 });
    });

    it('An error is thrown when init metadata because the arguments is not valid', () => {
        expect(Fjpublish).to.throw(Error);
        expect(() => Fjpublish(1)).to.throw(Error);
        expect(() => Fjpublish({})).to.throw(Error);
        expect(() => Fjpublish({ a: 1 })).to.throw(Error);
        expect(() => Fjpublish({ modules: 1 })).to.throw(Error);
        expect(() => Fjpublish({ modules: [] })).to.throw(Error);
        expect(() => Fjpublish({ modules: [{}] })).to.throw(Error);
        expect(() => Fjpublish({ modules: {} })).to.throw(Error);
    });

    it('Filter the correct publishing environment when initializing data', () => {
        let configObject = { modules: { test: { nobuild: true, tag: '123' }, pre_release: { name: '预发布环境' }, public: { tag: '123' } } };
        let configArray = { modules: [{ env: 'test', nobuild: true, tag: '123' }, { env: 'pre_release', name: '预发布环境' }, { env: 'public', tag: '123' }] };
        let testConfigObject = Fjpublish(configObject);
        let testConfigArray = Fjpublish(configArray);
        let optString = 'public';
        let optCollection = [{ env: 'test', a: 1, nobuild: undefined, tag: '456' }, 'public'];
        let testConfigObjectWithString = Fjpublish(configObject, optString);
        let testConfigObjectWithCollection = Fjpublish(configObject, optCollection);
        let testConfigArrayWithString = Fjpublish(configArray, optString);
        let testConfigArrayWithCollection = Fjpublish(configArray, optCollection);
        let testConfigWithStringResult = { modules: { public: { env: 'public', tag: '123' } } };
        let testConfigWithCollectionResult = { modules: { test: { a: 1, nobuild: true, tag: '456', env: 'test' }, public: { tag: '123', env: 'public' } } };

        expect(testConfigObject._metadata).to.deep.equal(configObject);
        expect(testConfigArray._metadata).to.deep.equal({ modules: { test: { env: 'test', nobuild: true, tag: '123' }, pre_release: { env: 'pre_release', name: '预发布环境' }, public: { env: 'public', tag: '123' } } });
        expect(testConfigObjectWithString._metadata).to.deep.equal(testConfigWithStringResult);
        expect(testConfigObjectWithCollection._metadata).to.deep.equal(testConfigWithCollectionResult);
        expect(testConfigArrayWithString._metadata).to.deep.equal(testConfigWithStringResult);
        expect(testConfigArrayWithCollection._metadata).to.deep.equal(testConfigWithCollectionResult);
    });

    it('Tests inherit when initializing data', () => {
        let configObject = { modules: { test: { nobuild: true } }, tag: '123' };
        let configArray = { modules: [{ env: 'test', nobuild: true }], tag: '123' };
        let testConfigObject = Fjpublish(configObject);
        let testConfigArray = Fjpublish(configArray);
        expect(testConfigObject._metadata.modules.test).to.have.property('tag', '123');
        expect(testConfigObject._metadata.modules.test).not.to.have.ownProperty('tag');
        expect(testConfigArray._metadata.modules.test).to.have.property('tag', '123');
        expect(testConfigArray._metadata.modules.test).not.to.have.ownProperty('tag');
    });

    it('Mount middleware', () => {
        let midOne = function midOne() {};
        let midTwo = function midTwo() {};
        let fj = Fjpublish({ modules: { test: { nobuild: true } } }).use(midOne).use(midTwo);
        expect(() => fj.use()).to.throw(Error);
        expect(() => fj.use(1)).to.throw(Error);
        expect(() => fj.use(function() {})).to.throw(Error);
        expect(fj._middlewares).to.deep.equal([midOne, midTwo]);
        fj._adjustModuleMiddlewares();
        expect(fj._metadata.modules.test._moduleMiddlewares).to.deep.equal([midOne, midTwo]);
    });

    it('Mount hook function', () => {
        let midOne = function midOne() {};
        let midTwo = function midTwo() {};
        let own = function own() {};
        let inherit = function inherit() {};
        let fj = Fjpublish({ modules: { test: { nobuild: true, beforeHooks: { when: 'midOne', fn: own } }, public: { tag: '123', afterHooks: [{ when: 'midOne', fn: own }] } }, beforeHooks: { when: 'midOne', fn: inherit } }).use(midOne).use(midTwo)._adjustModuleMiddlewares();
        expect(() => Fjpublish({ modules: { test: { beforeHooks: { when: 'midOne', fn: own } } } }).use(midTwo)._adjustModuleMiddlewares()).to.throw(Error);;
        expect(fj._metadata.modules.test._moduleMiddlewares).to.deep.equal([own, midOne, midTwo]);
        expect(fj._metadata.modules.public._moduleMiddlewares).to.deep.equal([inherit, midOne, own, midTwo]);
    });

    it('Adjust module middlewares ', () => {
        let midOne = function midOne() {};
        let midTwo = function midTwo() {};
        let midThree = function midThree() {};
        let midReplace = function midReplace() {};
        let fjTestUse = Fjpublish({ modules: [{ env: 'test', nobuild: true, middlewareUse: ['midOne', 'midTwo'] }, { env: 'public' }], middlewareUse: 'midThree' }).use(midOne).use(midTwo).use(midThree)._adjustModuleMiddlewares();
        expect(fjTestUse._metadata.modules.test._moduleMiddlewares).to.deep.equal([midOne, midTwo]);
        expect(fjTestUse._metadata.modules.public._moduleMiddlewares).to.deep.equal([midThree]);
        let fjTestIgnore = Fjpublish({ modules: [{ env: 'test', nobuild: true, middlewareIgnore: ['midOne', 'midTwo'] }, { env: 'public' }], middlewareIgnore: 'midThree' }).use(midOne).use(midTwo).use(midThree)._adjustModuleMiddlewares();
        expect(fjTestIgnore._metadata.modules.test._moduleMiddlewares).to.deep.equal([midThree]);
        expect(fjTestIgnore._metadata.modules.public._moduleMiddlewares).to.deep.equal([midOne, midTwo]);
        let fjTestReplace = Fjpublish({ modules: [{ env: 'test', nobuild: true, middlewareReplace: { name: 'midOne', middleware: midReplace } }] }).use(midOne).use(midTwo).use(midThree)._adjustModuleMiddlewares();
        expect(fjTestReplace._metadata.modules.test._moduleMiddlewares).to.deep.equal([midReplace, midTwo, midThree]);
    });
});

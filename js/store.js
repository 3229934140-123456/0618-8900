const SurveyStore = (function() {
    const API_BASE = '/api';

    async function request(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };
        const response = await fetch(API_BASE + url, { ...defaultOptions, ...options });
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            const error = await response.json().catch(() => ({ error: '请求失败' }));
            throw new Error(error.error || '请求失败');
        }
        return response.json();
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    async function getSurveys() {
        return request('/surveys');
    }

    async function getSurvey(id) {
        return request('/surveys/' + id);
    }

    async function createSurvey(surveyData) {
        return request('/surveys', {
            method: 'POST',
            body: JSON.stringify(surveyData)
        });
    }

    async function updateSurvey(id, updates) {
        return request('/surveys/' + id, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    async function deleteSurvey(id) {
        return request('/surveys/' + id, {
            method: 'DELETE'
        });
    }

    async function getSurveyResponses(surveyId) {
        return request('/surveys/' + surveyId + '/responses');
    }

    async function getResponseCount(surveyId) {
        const result = await request('/surveys/' + surveyId + '/responses/count');
        return result ? result.count : 0;
    }

    async function submitResponse(surveyId, answers, respondentInfo = {}) {
        try {
            const result = await request('/surveys/' + surveyId + '/responses', {
                method: 'POST',
                body: JSON.stringify({ answers, respondentInfo })
            });
            return result;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async function getResponse(id) {
        const responses = await getResponses();
        return responses.find(r => r.id === id) || null;
    }

    async function getResponses() {
        const surveys = await getSurveys();
        const allResponses = [];
        for (const survey of surveys) {
            const responses = await getSurveyResponses(survey.id);
            allResponses.push(...responses);
        }
        return allResponses;
    }

    async function getSurveyStatus(surveyId) {
        return request('/surveys/' + surveyId + '/status');
    }

    async function canTakeSurvey(survey, passwordInput = '') {
        const status = await getSurveyStatus(survey.id);
        if (!status || status.status !== 'active') {
            return { can: false, reason: status ? status.label : '问卷不存在' };
        }
        if (survey.settings.password && survey.settings.password !== passwordInput) {
            return { can: false, reason: '密码错误' };
        }
        return { can: true };
    }

    function getShareUrl(surveyId) {
        const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        return baseUrl + 'survey.html?id=' + surveyId;
    }

    function getEmbedCode(surveyId) {
        const url = getShareUrl(surveyId);
        return `<iframe src="${url}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
    }

    function createQuestion(type) {
        const id = generateId();
        const base = {
            id,
            type,
            title: '',
            required: false,
            logic: []
        };

        switch (type) {
            case 'single':
                return { ...base, options: ['选项1', '选项2', '选项3'] };
            case 'multiple':
                return { ...base, options: ['选项1', '选项2', '选项3'] };
            case 'dropdown':
                return { ...base, options: ['选项1', '选项2', '选项3'] };
            case 'text':
                return { ...base, placeholder: '请输入您的答案' };
            case 'rating':
                return { ...base, maxRating: 5 };
            case 'matrix':
                return {
                    ...base,
                    rows: ['行1', '行2', '行3'],
                    columns: ['列1', '列2', '列3']
                };
            default:
                return base;
        }
    }

    function calculateStats(survey, responses) {
        if (!survey || !responses) return null;

        const stats = {
            totalResponses: responses.length,
            questions: {}
        };

        survey.questions.forEach(question => {
            const qId = question.id;
            const qStats = {
                type: question.type,
                title: question.title,
                totalAnswered: 0
            };

            if (['single', 'multiple', 'dropdown'].includes(question.type)) {
                qStats.options = {};
                question.options.forEach(opt => {
                    qStats.options[opt] = 0;
                });

                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer !== undefined && answer !== null && answer !== '') {
                        qStats.totalAnswered++;
                        if (question.type === 'multiple') {
                            if (Array.isArray(answer)) {
                                answer.forEach(a => {
                                    if (qStats.options.hasOwnProperty(a)) {
                                        qStats.options[a]++;
                                    }
                                });
                            }
                        } else {
                            if (qStats.options.hasOwnProperty(answer)) {
                                qStats.options[answer]++;
                            }
                        }
                    }
                });

                qStats.percentages = {};
                Object.keys(qStats.options).forEach(opt => {
                    qStats.percentages[opt] = qStats.totalAnswered > 0
                        ? Math.round((qStats.options[opt] / qStats.totalAnswered) * 100)
                        : 0;
                });
            } else if (question.type === 'rating') {
                let sum = 0;
                let count = 0;
                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer && typeof answer === 'number') {
                        sum += answer;
                        count++;
                    }
                });
                qStats.totalAnswered = count;
                qStats.average = count > 0 ? (sum / count).toFixed(2) : 0;
                qStats.distribution = {};
                const maxRating = question.maxRating || 5;
                for (let i = 1; i <= maxRating; i++) {
                    qStats.distribution[i] = 0;
                }
                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer && qStats.distribution.hasOwnProperty(answer)) {
                        qStats.distribution[answer]++;
                    }
                });
            } else if (question.type === 'matrix') {
                qStats.rows = {};
                question.rows.forEach(row => {
                    qStats.rows[row] = {};
                    question.columns.forEach(col => {
                        qStats.rows[row][col] = 0;
                    });
                });
                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer && typeof answer === 'object') {
                        let answered = false;
                        Object.keys(answer).forEach(row => {
                            if (answer[row] && qStats.rows[row] && qStats.rows[row].hasOwnProperty(answer[row])) {
                                qStats.rows[row][answer[row]]++;
                                answered = true;
                            }
                        });
                        if (answered) qStats.totalAnswered++;
                    }
                });
            } else if (question.type === 'text') {
                qStats.answers = [];
                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer && answer.trim()) {
                        qStats.answers.push(answer);
                        qStats.totalAnswered++;
                    }
                });
            }

            stats.questions[qId] = qStats;
        });

        return stats;
    }

    function filterResponses(responses, filters) {
        if (!filters || Object.keys(filters).length === 0) {
            return responses;
        }

        return responses.filter(response => {
            for (const qId in filters) {
                const filter = filters[qId];
                const answer = response.answers[qId];

                if (filter.type === 'equals') {
                    if (Array.isArray(answer)) {
                        if (!answer.includes(filter.value)) return false;
                    } else {
                        if (answer !== filter.value) return false;
                    }
                } else if (filter.type === 'contains') {
                    if (Array.isArray(answer)) {
                        if (!answer.some(a => a.includes(filter.value))) return false;
                    } else {
                        if (!answer || !answer.includes(filter.value)) return false;
                    }
                }
            }
            return true;
        });
    }

    async function exportToExcel(surveyId) {
        window.location.href = API_BASE + '/export/' + surveyId;
    }

    async function initSampleData() {
        try {
            await request('/init-sample', { method: 'POST' });
            return true;
        } catch (e) {
            return false;
        }
    }

    return {
        generateId,
        getSurveys,
        getSurvey,
        createSurvey,
        updateSurvey,
        deleteSurvey,
        getResponses,
        getSurveyResponses,
        getResponseCount,
        submitResponse,
        getResponse,
        calculateStats,
        filterResponses,
        exportToExcel,
        createQuestion,
        getSurveyStatus,
        canTakeSurvey,
        getShareUrl,
        getEmbedCode,
        initSampleData
    };
})();
